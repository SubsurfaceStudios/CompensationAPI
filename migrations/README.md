# Init Scripts
When using the default Docker Compose confguration, SQL files
located in this directory will be automatically executed by Docker
upon the Postgres container starting for the first time.

These scripts are used to initialize the basic state of the DB.
If you need to make additional changes after the container has
already been started, you will need to connect to the database
and manually make the changes yourself.