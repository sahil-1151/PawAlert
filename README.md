# PawAlert — Animal Rescue & Welfare System

**Team:** Escxspace &nbsp;|&nbsp; **Team ID:** OSDBMS-V-2026-T220

PawAlert turns scattered, informal animal-welfare reporting (phone calls, WhatsApp groups, social media posts) into a structured digital workflow. A citizen reports an incident with location, animal type, condition, and evidence; the system maps it to an operational area, notifies the responsible moderator, prioritizes the case, assigns a resource, and keeps a complete status history until it's resolved.

The project is built for a fifth-semester Operating Systems + DBMS PBL, and is designed to demonstrate both subjects together: the database keeps records safe, consistent, and queryable, while the OS side is shown through concurrent request handling, worker processes, priority scheduling, synchronization, and file/I/O handling.

## Problem

Animal-welfare reports today rely on informal channels with no shared database, no status trail, and no measurable response workflow — reports get duplicated, ignored, or lost. PawAlert replaces that with a coordinated system that has area-wise moderators, structured case data, evidence handling, priority scoring, resource matching, and full case history.

## Features

- Citizen incident reporting with location, animal condition, description, and photo evidence
- Automatic area mapping and moderator assignment
- Case verification, priority calculation, resource/action assignment, and status history
- Background worker layer with a priority queue for urgent vs. routine cases
- Role-based access for citizens, moderators, and administrators
- Dashboard and reporting queries (unresolved cases, area-wise analytics, resource availability)

## Tech / Concepts Demonstrated

**DBMS:** ER modelling, schema normalization, constraints, indexes, transactions, rollback, reporting queries
**OS:** Concurrent request handling, producer-consumer queues, worker threads/processes, priority scheduling, synchronization, file/I/O handling

## Core Entities

`AREA`, `USER`, `MODERATOR`, `REPORT`, `ANIMAL_CASE`, `ACTION`, `RESOURCE`, `CASE_STATUS_HISTORY`, `NOTIFICATION`, `AUDIT_LOG`

## Architecture

```
Citizen / User --> Web/Mobile App --> Application Server --> Area Moderator
                         |                    |                    |
                   Evidence Storage    Relational Database   Background Worker
                                              ^                     |
                                              |_____________________|
                                                                     |
                                                          Vet / Volunteer / Cleanup Resource
```

A citizen submits a report through the app; the server validates it, saves it to the database, maps it to an area, and creates a case. The moderator verifies the case and assigns a resource. A background worker processes notification and priority jobs so urgent cases are handled first, while the database keeps the authoritative case status and history.

## Team

| Member | Role |
|---|---|
| **Sahil** (Team Lead) | Backend/API integration, report transaction, area mapping, build setup, final integration |
| **Vani Kathait** | Database schema, ER model, normalization, dashboard queries, indexes, analytics |
| **Prakhar Pratap Singh Rana** | Worker layer, priority scheduling, queues, synchronization, notifications, concurrency testing |

## Roadmap (Tentative 8-Week Plan)

1. Requirements, role model, area/moderator workflow, DB schema draft, UI wireframes
2. Authentication, role-based access, user and area tables, report submission form
3. Incident reporting with location/evidence handling and `REPORT` → `ANIMAL_CASE` transaction
4. Moderator dashboard, case verification, status history, priority score calculation
5. Resource management, action assignment, notification records, SQL reports
6. OS worker layer with priority queue, producer-consumer processing, synchronization, scheduling demo
7. Concurrency tests, transaction rollback tests, indexing, analytics, security hardening
8. Integration, screenshots, measurements, final documentation, presentation, viva preparation

**Stretch goals:** map-based area polygons, nearest-resource selection using Haversine distance, offline-first reporting, SMS/WhatsApp-style notifications, heat-map analytics.

## Status

🚧 In development — Phase 1 (proposal & design).

## References

- Silberschatz, Korth, Sudarshan — *Database System Concepts*
- Ramakrishnan, Gehrke — *Database Management Systems*
- Silberschatz, Galvin, Gagne — *Operating System Concepts*
- Elmasri, Navathe — *Fundamentals of Database Systems*
