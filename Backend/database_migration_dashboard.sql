-- Run once in psql:  \i Backend/database_migration_dashboard.sql
-- Associates each future report with the signed-in citizen who submitted it.
ALTER TABLE report
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES app_user(user_id);

CREATE INDEX IF NOT EXISTS idx_report_user_id ON report(user_id);

-- Detailed location and incident information for the report form/dashboard.
ALTER TABLE report
    ADD COLUMN IF NOT EXISTS city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS state VARCHAR(100),
    ADD COLUMN IF NOT EXISTS pincode VARCHAR(15),
    ADD COLUMN IF NOT EXISTS location VARCHAR(255),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS report_photo TEXT,
    ADD COLUMN IF NOT EXISTS completion_photo TEXT;
