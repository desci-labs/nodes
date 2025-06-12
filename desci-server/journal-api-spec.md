# Journal API Specification

## API Routes

### Authentication & Authorization

```
POST /api/journal/auth/login
Request:
{
  email: string
  password: string
}
Response: {
  token: string
  user: User
}

POST /api/journal/auth/logout
Response: { success: boolean }

GET /api/journal/auth/me
Response: User
```

### Journal Management

```
POST /api/journals
Request: {
  name: string
  description?: string
  icon?: string
  isCommercial?: boolean
}
Response: Journal

GET /api/journals
Query Params: {
  page?: number
  limit?: number
  search?: string
}
Response: {
  journals: Journal[]
  total: number
  page: number
  limit: number
}

GET /api/journals/:journalId
Response: Journal

PUT /api/journals/:journalId
Request: {
  name?: string
  description?: string
  icon?: string
  isCommercial?: boolean
}
Response: Journal

DELETE /api/journals/:journalId
Response: { success: boolean }
```

### Editor Management

```
POST /api/journals/:journalId/editors/invite
Request: {
  email: string
  role: EditorRole
  expertise?: string[]
}
Response: EditorInvite

GET /api/journals/:journalId/editors
Response: JournalEditor[]

PUT /api/journals/:journalId/editors/:editorId
Request: {
  role?: EditorRole
  expertise?: string[]
}
Response: JournalEditor

DELETE /api/journals/:journalId/editors/:editorId
Response: { success: boolean }

GET /api/journal/invites
Response: EditorInvite[]

POST /api/journal/invites/:inviteId/accept
Response: JournalEditor

POST /api/journal/invites/:inviteId/decline
Response: { success: boolean }
```

### Submission Management

```
POST /api/journals/:journalId/submissions
Request: {
  dpid: string
  version: string
  title: string
}
Response: JournalSubmission

GET /api/journals/:journalId/submissions
Query Params: {
  page?: number
  limit?: number
  status?: SubmissionStatus
  assignedEditorId?: number
}
Response: {
  submissions: JournalSubmission[]
  total: number
  page: number
  limit: number
}

GET /api/journals/:journalId/submissions/:submissionId
Response: JournalSubmission

PUT /api/journals/:journalId/submissions/:submissionId/status
Request: {
  status: SubmissionStatus
  comments?: string
}
Response: JournalSubmission

PUT /api/journals/:journalId/submissions/:submissionId/assign
Request: {
  editorId: number
}
Response: JournalSubmission

GET /api/user/submissions
Response: JournalSubmission[]
```

### Referee Management

```
GET /api/submissions/:submissionId/referees
Response: RefereeAssignment[]

POST /api/submissions/:submissionId/referees/invite
Request: {
  email: string
  dueDate?: Date
}
Response: RefereeInvite

DELETE /api/submissions/:submissionId/referees/:refereeId
Response: { success: boolean }

PUT /api/submissions/:submissionId/referees/:refereeId/reassign
Response: RefereeAssignment

GET /api/referee/invites/:inviteId
Response: RefereeInvite

POST /api/referee/invites/:inviteId/accept
Response: RefereeAssignment

POST /api/referee/invites/:inviteId/decline
Request: {
  suggestedReferees?: string[]
}
Response: { success: boolean }
```

### Reviews & Revisions

```
POST /api/submissions/:submissionId/reviews
Request: {
  recommendation: ReviewDecision
  comments: string
  confidentialComments?: string
}
Response: Review

GET /api/submissions/:submissionId/reviews
Response: Review[]

GET /api/submissions/:submissionId/reviews/:reviewId
Response: Review

POST /api/submissions/:submissionId/revisions/request
Request: {
  type: RevisionType
  comments: string
}
Response: Revision

GET /api/submissions/:submissionId/revisions
Response: Revision[]

POST /api/submissions/:submissionId/revisions
Request: {
  dpid: string
  version: string
}
Response: Revision

POST /api/submissions/:submissionId/decision
Request: {
  decision: SubmissionStatus
  comments?: string
}
Response: JournalSubmission
```

### DOI Management

```
POST /api/submissions/:submissionId/mint-doi
Response: {
  doi: string
  mintedAt: Date
}

GET /api/submissions/:submissionId/doi
Response: {
  doi: string
  mintedAt: Date
}
```

### Stats & Dashboard

```
GET /api/journals/:journalId/stats
Query Params: {
  startDate?: Date
  endDate?: Date
}
Response: JournalStats

GET /api/journals/:journalId/stats/submissions
Query Params: {
  startDate?: Date
  endDate?: Date
}
Response: {
  total: number
  accepted: number
  rejected: number
  pending: number
}

GET /api/journals/:journalId/stats/reviews
Query Params: {
  startDate?: Date
  endDate?: Date
}
Response: {
  avgTimeToFirstReview: number
  avgReviewTime: number
  completionRate: number
}

GET /api/journals/:journalId/stats/referees
Query Params: {
  startDate?: Date
  endDate?: Date
}
Response: {
  totalInvited: number
  acceptedRate: number
  avgResponseTime: number
}

GET /api/journals/:journalId/submissions/graph
Query Params: {
  startDate?: Date
  endDate?: Date
  interval?: 'day' | 'week' | 'month'
}
Response: {
  data: {
    date: Date
    submissions: number
    accepted: number
    rejected: number
  }[]
}
```

### Communication

```
POST /api/submissions/:submissionId/messages
Request: {
  receiverId: number
  message: string
}
Response: Message

GET /api/submissions/:submissionId/messages
Response: Message[]
```

### Audit Logs

```
GET /api/submissions/:submissionId/audit-log
Response: AuditLog[]
```

### Billing (for Commercial Journals)

```
GET /api/journals/:journalId/billing
Response: JournalBilling

GET /api/journals/:journalId/billing/invoices
Response: JournalInvoice[]
```

## Schema

The schema is already defined in the Prisma schema file and includes all necessary models:

- Journal
- JournalEditor
- JournalSubmission
- Revision
- RefereeAssignment
- Review
- AuditLog
- EditorInvite
- RefereeInvite
- Message
- JournalEmailTemplate
- JournalBilling
- JournalInvoice

## Implementation Notes

1. **Access Control**:

   - Chief Editors can manage other editors and see all submissions
   - Associate Editors can only see and manage their assigned submissions
   - Authors can only see their own submissions
   - Referees can only see submissions they are invited to review

2. **Referee Management**:

   - Maximum of 3 referees can be assigned to a submission
   - System should prevent further invites once 3 referees have accepted

3. **Email Notifications**:

   - All key actions should trigger email notifications
   - Templates should be customizable per journal

4. **Dashboard Stats**:

   - Should support date range filtering
   - Cached in JournalStats model for performance

5. **DOI Minting**:

   - Should happen automatically upon acceptance
   - DOI record should be linked to the submission

6. **Audit Logging**:

   - All significant actions should be logged for transparency
   - Each log entry should include who did what and when

7. **Billing for Commercial Journals**:
   - Track DOIs minted for billing purposes
   - Generate monthly invoices automatically
