# About
This repository contains the source code for the Compensation VR API, which is used
to operate the official backend. We have also designed it to be reasonably straightforward
to self-host, so that you can run your own private CVR server!

# Self-Hosting
We've finally simplified the process to self-host your own Compensation VR instance!

You can run the following commands to get a basic CVR instance running locally,
and you can modify `compose.yml` and `.env` as necessary to fit your needs.

```bash
# Make a directory for the config files
mkdir cvr-api
cd cvr-api

# Fetch the Docker Compose configuration
curl -o compose.yml "https://raw.githubusercontent.com/SubsurfaceStudios/CompensationAPI/refs/heads/main/compose.yml"

# Fetch the example environment variables, and put them in .env
curl -o .env "https://raw.githubusercontent.com/SubsurfaceStudios/CompensationAPI/refs/heads/main/.env.example"

# You can edit the compose.yml and .env here as you please.
# You'll probably want to change things like the database password before running the API for the first time.

# Now it's time to run the instance!
docker compose up
```