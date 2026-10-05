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
    ADD COLUMN IF NOT EXISTS completion_photo TEXT,
    ADD COLUMN IF NOT EXISTS animal_species VARCHAR(100),
    ADD COLUMN IF NOT EXISTS animal_details VARCHAR(255),
    ADD COLUMN IF NOT EXISTS authority_type VARCHAR(40) NOT NULL DEFAULT 'government',
    ADD COLUMN IF NOT EXISTS condition_other VARCHAR(255),
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Only reports intentionally shared with the PawAlert community appear there.
CREATE INDEX IF NOT EXISTS idx_report_authority_type ON report(authority_type);

CREATE TABLE IF NOT EXISTS moderator_location (
    user_id INTEGER PRIMARY KEY REFERENCES app_user(user_id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
