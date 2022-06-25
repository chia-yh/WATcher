import { AfterViewInit, Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatPaginator, MatSort } from '@angular/material';
import * as moment from 'moment';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { GithubUser } from '../../core/models/github-user.model';
import { Issue, STATUS } from '../../core/models/issue.model';
import { DialogService } from '../../core/services/dialog.service';
import { ErrorHandlingService } from '../../core/services/error-handling.service';
import { GithubService } from '../../core/services/github.service';
import { IssueService } from '../../core/services/issue.service';
import { LabelService } from '../../core/services/label.service';
import { LoggingService } from '../../core/services/logging.service';
import { PermissionService } from '../../core/services/permission.service';
import { PhaseService } from '../../core/services/phase.service';
import { UserService } from '../../core/services/user.service';
import { IssuesDataTable } from '../../shared/issue-tables/IssuesDataTable';

export enum ACTION_BUTTONS {
  VIEW_IN_WEB,
  MARK_AS_RESPONDED,
  MARK_AS_PENDING,
  RESPOND_TO_ISSUE,
  FIX_ISSUE,
  DELETE_ISSUE
}

@Component({
  selector: 'app-card-view',
  templateUrl: './card-view.component.html',
  styleUrls: ['./card-view.component.css']
})
export class CardViewComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() headers: string[];
  @Input() actions: ACTION_BUTTONS[];
  @Input() assignee?: GithubUser = undefined;
  @Input() filters?: any = undefined;

  @ViewChild(MatPaginator, { static: true }) paginator: MatPaginator;
  @ViewChild(MatSort, { static: true }) sort: MatSort;

  issues: IssuesDataTable;
  issues$: Observable<Issue[]>;
  issuesPendingDeletion: { [id: number]: boolean };

  public readonly action_buttons = ACTION_BUTTONS;

  // Messages for the modal popup window upon deleting an issue
  private readonly deleteIssueModalMessages = ['Do you wish to delete this issue?', 'This action is irreversible!'];
  private readonly yesButtonModalMessage = 'Yes, I wish to delete this issue';
  private readonly noButtonModalMessage = "No, I don't wish to delete this issue";

  constructor(
    public userService: UserService,
    public permissions: PermissionService,
    public labelService: LabelService,
    private githubService: GithubService,
    public issueService: IssueService,
    private phaseService: PhaseService,
    private errorHandlingService: ErrorHandlingService,
    private loggingService: LoggingService,
    private dialogService: DialogService
  ) {}

  ngOnInit() {
    this.issues = new IssuesDataTable(this.issueService, this.sort, this.paginator, this.headers, this.assignee, this.filters);
    this.issuesPendingDeletion = {};
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.issues.loadIssues();
      this.issues$ = this.issues.connect();
    });
  }

  ngOnDestroy(): void {
    setTimeout(() => {
      this.issues.disconnect();
    });
  }

  /**
   * Formats the title text to account for those that contain long words.
   * @param title - Title of Issue that is to be displayed in the Table Row.
   */
  fitTitleText(title: string): string {
    // Arbitrary Length of Characters beyond which an overflow occurs.
    const MAX_WORD_LENGTH = 43;
    const SPLITTER_TEXT = ' ';
    const ELLIPSES = '...';

    return title
      .split(SPLITTER_TEXT)
      .map((word) => {
        if (word.length > MAX_WORD_LENGTH) {
          return word.substring(0, MAX_WORD_LENGTH - 5).concat(ELLIPSES);
        }
        return word;
      })
      .join(SPLITTER_TEXT);
  }

  isActionVisible(action: ACTION_BUTTONS): boolean {
    return this.actions.includes(action);
  }

  markAsResponded(issue: Issue, event: Event) {
    this.loggingService.info(`IssueTablesComponent: Marking Issue ${issue.id} as Responded`);
    const newIssue = issue.clone(this.phaseService.currentPhase);
    newIssue.status = STATUS.Done;
    this.issueService.updateIssue(newIssue).subscribe(
      (updatedIssue) => {
        this.issueService.updateLocalStore(updatedIssue);
      },
      (error) => {
        this.errorHandlingService.handleError(error);
      }
    );
    event.stopPropagation();
  }

  isResponseEditable() {
    return this.permissions.isTeamResponseEditable() || this.permissions.isTesterResponseEditable();
  }

  markAsPending(issue: Issue, event: Event) {
    this.loggingService.info(`IssueTablesComponent: Marking Issue ${issue.id} as Pending`);
    const newIssue = issue.clone(this.phaseService.currentPhase);
    newIssue.status = STATUS.Incomplete;
    this.issueService.updateIssue(newIssue).subscribe(
      (updatedIssue) => {
        this.issueService.updateLocalStore(updatedIssue);
      },
      (error) => {
        this.errorHandlingService.handleError(error);
      }
    );
    event.stopPropagation();
  }

  logIssueRespondRouting(id: number) {
    this.loggingService.info(`IssueTablesComponent: Proceeding to Respond to Issue ${id}`);
  }

  logIssueEditRouting(id: number) {
    this.loggingService.info(`IssueTablesComponent: Proceeding to Edit Issue ${id}`);
  }

  /**
   * Gets the number of resolved disputes.
   */
  todoFinished(issue: Issue): number {
    return issue.issueDisputes.length - issue.numOfUnresolvedDisputes();
  }

  /**
   * Checks if all the disputes are resolved.
   */
  isTodoListChecked(issue: Issue): boolean {
    return issue.issueDisputes && issue.numOfUnresolvedDisputes() === 0;
  }

  viewIssueInBrowser(id: number, event: Event) {
    this.loggingService.info(`IssueTablesComponent: Opening Issue ${id} on Github`);
    this.githubService.viewIssueInBrowser(id, event);
  }

  deleteIssue(id: number, event: Event) {
    this.loggingService.info(`IssueTablesComponent: Deleting Issue ${id}`);
    this.issuesPendingDeletion = {
      ...this.issuesPendingDeletion,
      [id]: true
    };
    this.issueService
      .deleteIssue(id)
      .pipe(
        finalize(() => {
          const { [id]: issueRemoved, ...theRest } = this.issuesPendingDeletion;
          this.issuesPendingDeletion = theRest;
        })
      )
      .subscribe(
        (removedIssue) => {},
        (error) => {
          this.errorHandlingService.handleError(error);
        }
      );
    event.stopPropagation();
  }

  openDeleteDialog(id: number, event: Event) {
    const dialogRef = this.dialogService.openUserConfirmationModal(
      this.deleteIssueModalMessages,
      this.yesButtonModalMessage,
      this.noButtonModalMessage
    );

    dialogRef.afterClosed().subscribe((res) => {
      if (res) {
        this.loggingService.info(`Deleting issue ${id}`);
        this.deleteIssue(id, event);
      }
    });
  }

  getIssueOpenOrCloseColor(issue: Issue) {
    return issue.githubIssue.state === 'OPEN' ? 'green' : 'purple';
  }

  getIssueOpenOrCloseColorCSSClass(issue: Issue) {
    return issue.githubIssue.state === 'OPEN' ? 'border-green' : 'border-purple';
  }

  getOcticon(issue: Issue) {
    const type = issue.githubIssue.issueOrPr;
    const state = issue.githubIssue.state;

    switch (true) {
      case type === 'Issue' && state === 'OPEN': {
        return 'issue-opened';
      }
      case type === 'Issue' && state === 'CLOSED': {
        return 'issue-closed';
      }
      case type === 'PullRequest' && state === 'OPEN': {
        return 'git-pull-request';
      }
      case type === 'PullRequest': {
        return 'git-merge';
      }
      default: {
        return 'circle'; // unknown type and state
      }
    }
  }

  /**
   * Truncates description to fit in card content.
   * @param description - Description of Issue that is to be displayed.
   */
  fitDescriptionText(description: string): string {
    // Arbitrary Length of Characters beyond which an overflow occurs.
    const MAX_CHARACTER_LENGTH = 72;
    const ELLIPSES = '...';

    return description.slice(0, MAX_CHARACTER_LENGTH) + ELLIPSES;
  }

  readableDateFormat(date: string) {
    return moment(date).format('lll');
  }
}
