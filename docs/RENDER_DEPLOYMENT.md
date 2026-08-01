# Deploy Rumbo's Spree backend on Render

The repository contains a Render Blueprint at `/render.yaml`. It provisions:

- `rumbo1-spree`: Spree Commerce 5.4, built from the official container image.
- `rumbo1-postgres`: PostgreSQL 18, shared by Spree and Rumbo's application tables.

Render generates and stores `DATABASE_URL`, `SECRET_KEY_BASE`, and the Mission
Control password. Do not add these values to GitHub.

## First deployment

1. Merge the pull request that adds this configuration into `main`.
2. In Render, discard any unfinished manual **Web Service** setup.
3. Select **New > Blueprint**.
4. Connect the GitHub repository `rbellatinf/Rumbo1`.
5. Select branch `main`. Render will detect `/render.yaml`; leave the root
   directory empty.
6. Review the two resources and select **Apply** or **Deploy Blueprint**.
7. Wait until both resources are green. The first build can take several
   minutes because Render downloads and starts Spree, runs its migrations, and
   applies `backend/postgres/init/010_rumbo_core.sql`.

## Verify the deployment

- Open `https://<your-service>.onrender.com/up`; it should return a healthy
  response.
- Open `https://<your-service>.onrender.com/admin` to reach Spree Admin.
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

## Free-tier limitations

This Blueprint uses Render's free plans only for the first technical test.
Free PostgreSQL expires after 30 days and does not include production backups.
Spree can also exceed a free web service's available memory. Before loading
real products, customers, or orders, move both resources to paid plans and add
object storage for uploaded product images.
