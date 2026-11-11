# Oak Platform — Solo Owner Release Policy

Owner: sandipniyogi

## Merge approval

1. GitHub automated checks must pass at the current PR head.
2. The owner must inspect the PR changes and record approval
   against the full commit SHA.
3. Approval must identify any outstanding risks.
4. Merge only through GitHub's normal protected process.
5. Required GitHub rules must not be bypassed.

## Production deployment

Merge approval does NOT authorize production deployment.

Before deploying:
- Verify the approved code version.
- Check Mac Live and VPS source integrity.
- Verify database backups and rollback procedures.
- Preserve business records and screenshot media.
- Obtain separate explicit production deployment approval.

The existing pre-push hook and production gate remain enabled.

Automatic Social AI publishing remains disabled until its
approval workflow and publishing integration are verified.
