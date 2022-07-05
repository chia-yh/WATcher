import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RoutesRecognized } from '@angular/router';
import { filter, pairwise } from 'rxjs/operators';
import { AppConfig } from '../../../environments/environment';
import { Phase } from '../../core/models/phase.model';
import { UserRole } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { DialogService } from '../../core/services/dialog.service';
import { ElectronService } from '../../core/services/electron.service';
import { ErrorHandlingService } from '../../core/services/error-handling.service';
import { GithubService } from '../../core/services/github.service';
import { GithubEventService } from '../../core/services/githubevent.service';
import { IssueService } from '../../core/services/issue.service';
import { LoggingService } from '../../core/services/logging.service';
import { PhaseDescription, PhaseService } from '../../core/services/phase.service';
import { UserService } from '../../core/services/user.service';

const ISSUE_TRACKER_URL = 'https://github.com/CATcher-org/CATcher/issues';

@Component({
  selector: 'app-layout-header',
  templateUrl: './header.component.html'
})
export class HeaderComponent implements OnInit {
  private prevUrl;
  isReloadButtonDisabled = false;
  ISSUE_FILTER = '/issues?q=is:issue+is:all'; // the filtered list must be an issue and must be open
  TUTORIAL_LABEL = '+label:tutorial.';
  TEAM_LABEL = '+label:team.';
  EXCLUDE_DUPLICATE = '+-label:duplicate'; // exclude duplicate issues

  // Messages for the modal popup window upon logging out
  private readonly logOutDialogMessages = ['Do you wish to log out?'];
  private readonly yesButtonDialogMessage = 'Yes, I wish to log out';
  private readonly noButtonDialogMessage = "No, I don't wish to log out";

  constructor(
    private router: Router,
    public auth: AuthService,
    public phaseService: PhaseService,
    public userService: UserService,
    public loggingService: LoggingService,
    private location: Location,
    private githubEventService: GithubEventService,
    private issueService: IssueService,
    private errorHandlingService: ErrorHandlingService,
    private githubService: GithubService,
    private electronService: ElectronService,
    private dialogService: DialogService
  ) {
    router.events
      .pipe(
        filter((e: any) => e instanceof RoutesRecognized),
        pairwise()
      )
      .subscribe((e) => {
        this.prevUrl = e[0].urlAfterRedirects;
      });
  }

  ngOnInit() {}

  /**
   * Replaces and resets the current phase data and routes the app to the
   * newly selected phase.
   * @param openPhase - Open Phase that is selected by the user.
   */
  routeToSelectedPhase(openPhase: string): void {
    // Do nothing if the selected phase is the current phase.
    if (this.phaseService.currentPhase === Phase[openPhase]) {
      return;
    }
    // Replace Current Phase Data.
    this.phaseService.currentPhase = Phase[openPhase];
    this.githubService.storePhaseDetails(this.phaseService.getRepository()[0].owner, this.phaseService.getRepository()[0].name);

    // Remove current phase issues and load selected phase issues.
    this.githubService.reset();
    this.issueService.reset(false);
    this.reload();

    // Route app to new phase.
    this.router.navigateByUrl(this.phaseService.currentPhase);
  }

  isBackButtonShown(): boolean {
    return `/${this.phaseService.currentPhase}` !== this.router.url && this.router.url !== '/' && !this.router.url.startsWith('/?code');
  }

  isReloadButtonShown(): boolean {
    return this.router.url !== '/phaseBugReporting/issues/new';
  }

  isOpenUrlButtonShown(): boolean {
    return (
      this.phaseService.currentPhase === Phase.issuesViewer ||
      this.userService.currentUser.role === UserRole.Student ||
      this.issueService.getIssueTeamFilter() !== 'All Teams' ||
      this.router.url.includes('/issues')
    );
  }

  getVersion(): string {
    return AppConfig.version;
  }

  getPhaseDescription(openPhase: string): string {
    return PhaseDescription[openPhase];
  }

  goBack() {
    if (this.prevUrl === `/${this.phaseService.currentPhase}/issues/new`) {
      this.router.navigateByUrl(this.phaseService.currentPhase);
    } else {
      this.location.back();
    }
  }

  viewBrowser() {
    if (this.phaseService.currentPhase === Phase.activityDashboard) {
      this.electronService.openLink('https://github.com/gycgabriel/WATcher-test/pulse');
      return;
    }

    const routerUrl = this.router.url.substring(1); // remove the first '/' from string
    const issueUrlIndex = routerUrl.indexOf('/'); // find the index of second '/'
    let issueUrl: string;

    // If can't find the index of second '/', then router is at the /issues (table list) page
    if (issueUrlIndex < 0) {
      // Apply filters to the issueUrl
      issueUrl = this.ISSUE_FILTER;
    } else {
      // issueUrl will be from the second '/'
      issueUrl = routerUrl.substring(issueUrlIndex);
    }
    // Open the url in user's preferred browser
    this.electronService.openLink('https://github.com/'.concat(this.githubService.getRepoURL()).concat(issueUrl));
  }

  openIssueTracker() {
    this.electronService.openLink(ISSUE_TRACKER_URL);
  }

  reload() {
    this.isReloadButtonDisabled = true;

    this.githubEventService.reloadPage().subscribe(
      (success) => success,
      (error) => {
        this.errorHandlingService.handleError(error, () => this.githubEventService.reloadPage());
      }
    );

    // Prevent user from spamming the reload button
    setTimeout(() => {
      this.isReloadButtonDisabled = false;
    }, 3000);
  }

  logOut() {
    this.auth.logOut();
  }

  openLogOutDialog() {
    const dialogRef = this.dialogService.openUserConfirmationModal(
      this.logOutDialogMessages,
      this.yesButtonDialogMessage,
      this.noButtonDialogMessage
    );

    dialogRef.afterClosed().subscribe((res) => {
      if (res) {
        this.loggingService.info(`Logging out from ${this.userService.currentUser.loginId}`);
        this.logOut();
      }
    });
  }

  exportLogFile() {
    this.loggingService.exportLogFile();
  }
}
