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

ALTER TABLE animal_case
    ADD COLUMN IF NOT EXISTS assigned_moderator_user_id INTEGER REFERENCES app_user(user_id),
    ADD COLUMN IF NOT EXISTS moderator_note TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS case_update (
    update_id SERIAL PRIMARY KEY,
    case_id INTEGER NOT NULL REFERENCES animal_case(case_id) ON DELETE CASCADE,
    author_user_id INTEGER NOT NULL REFERENCES app_user(user_id),
    status VARCHAR(20) NOT NULL,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS animal_breed (
    breed_id SERIAL PRIMARY KEY,
    animal_type VARCHAR(50) NOT NULL,
    breed_name VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO animal_breed (animal_type, breed_name) VALUES
    ('Dog', 'German Shepherd'), ('Dog', 'Golden Retriever'), ('Dog', 'Labrador Retriever'),
    ('Dog', 'Indian Pariah Dog'), ('Dog', 'Beagle'), ('Dog', 'Pug'), ('Dog', 'Rottweiler'),
    ('Dog', 'Siberian Husky'), ('Dog', 'Doberman'), ('Dog', 'Cocker Spaniel'),
    ('Dog', 'Indian Spitz'), ('Dog', 'Rajapalayam'), ('Dog', 'Mudhol Hound'),
    ('Dog', 'Kombai'), ('Dog', 'Chippiparai'), ('Dog', 'Rampur Hound'),
    ('Dog', 'Indian Mastiff'), ('Dog', 'Dachshund'), ('Dog', 'Shih Tzu'),
    ('Dog', 'Pomeranian'), ('Dog', 'Boxer'), ('Dog', 'Great Dane'),
    ('Cat', 'Indian Domestic Shorthair'), ('Cat', 'Persian'), ('Cat', 'Siamese'),
    ('Cat', 'Maine Coon'), ('Cat', 'Bengal'), ('Cat', 'Himalayan'),
    ('Cat', 'Indian Domestic Longhair'), ('Cat', 'Bombay Cat'),
    ('Cow', 'Indian Desi Cow'), ('Cow', 'Jersey Cow'), ('Cow', 'Gir Cow'),
    ('Cow', 'Sahiwal Cow'), ('Buffalo', 'Murrah Buffalo'), ('Buffalo', 'Indian Water Buffalo'),
    ('Goat', 'Indian Goat'), ('Goat', 'Jamunapari Goat'), ('Goat', 'Black Bengal Goat'),
    ('Bird', 'Rock Pigeon'), ('Bird', 'Indian Parakeet'), ('Bird', 'House Sparrow'),
    ('Bird', 'House Crow'), ('Bird', 'Common Myna'), ('Bird', 'Indian Kite'),
    ('Bird', 'Domestic Chicken'), ('Other', 'Indian Street Dog'), ('Other', 'Stray Cat')
ON CONFLICT (breed_name) DO NOTHING;
