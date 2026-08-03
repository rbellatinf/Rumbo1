# Deploy Rumbo's Spree backend on Render

The repository contains a Render Blueprint at `/render.yaml`. It provisions:

- `rumbo1-spree`: Spree Commerce 5.4, built from the official container image.
- `rumbo1-postgres`: PostgreSQL 18, shared by Spree and Rumbo's application tables.
- `rumbo1-redis`: a Redis-compatible Render Key Value instance used by Sidekiq.

Render generates and stores `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY_BASE`, and
the Mission Control password. Do not add these values to GitHub.

At runtime, the Spree start script reads Render's `RENDER_EXTERNAL_HOSTNAME`
and configures Rails and Active Storage with the public HTTPS hostname. This is
required so Store API image URLs point to the deployed service instead of
`localhost`.

## First deployment

1. Merge the pull request that adds this configuration into `main`.
2. In Render, discard any unfinished manual **Web Service** setup.
3. Select **New > Blueprint**.
4. Connect the GitHub repository `rbellatinf/Rumbo1`.
5. Select branch `main`. Render will detect `/render.yaml`; leave the root
   directory empty.
6. Review the three resources and select **Apply** or **Deploy Blueprint**.
7. Wait until all resources are green. The first build can take several
   minutes because Render downloads and starts Spree, runs its migrations, and
   applies every versioned SQL file under `backend/postgres/init`, including
   the reservation tables and their audit triggers.

## Verify the deployment

- Open `https://<your-service>.onrender.com/up`; it should return a healthy
  response.
- Open `https://<your-service>.onrender.com/admin` to reach Spree Admin.
- Confirm that `POST /api/v3/store/booking_requests` accepts a valid request
  with the publishable API key after the booking extension is deployed.
- Spree's initial development credentials are commonly
  `spree@example.com` / `spree123`. Change them immediately if the image creates
  that account.
- Mission Control is available at `/jobs`; its username is `jobs`, and its
  generated password is visible only in the service's Render environment.

## Connect the Rumbo storefront afterward

Once Spree is healthy, create a publishable Spree API key and configure the
storefront with:

- `SPREE_API_URL=https://<your-service>.onrender.com`
- `SPREE_PUBLISHABLE_API_KEY=<publishable key>`

Keep AirLabs configured only in the storefront's server-side secrets. Never
commit either API key to this repository.

## Background jobs

Spree 5.4 uses Sidekiq. The Blueprint supplies `REDIS_URL`, which lets the web
service enqueue background work without failing Store API requests. Render does
not offer a free background-worker instance, so the no-cost setup is intended
only for catalog and integration testing. Before enabling checkout, emails, or
other job-dependent workflows, add a paid worker from the same image with the
command `bundle exec sidekiq` and the same database, Redis, and Rails secrets.

## Free-tier limitations

This Blueprint uses Render's free plans only for the first technical test.
Free PostgreSQL expires after 30 days and does not include production backups.
Free Key Value is in-memory only and loses queued data whenever it restarts.
Spree can also exceed a free web service's available memory. Before loading
real products, customers, or orders, move the resources to paid plans and add
object storage for uploaded product images.
