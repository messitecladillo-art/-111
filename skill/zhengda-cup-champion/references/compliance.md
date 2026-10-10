# Compliance and integrity

## Scope rule

Resolve edition, group, track, region, and stage before using a requirement. Treat any unsourced remembered rule as provisional.

## Source hierarchy

1. National organizing committee formal notice or attachment.
2. Official regional organizing committee notice.
3. Official university competition notice.
4. Organizer or judge training material.
5. Informal summaries and prior-team experience.

When sources conflict, preserve both, compare scope and publication time, and request clarification if the conflict affects eligibility or submission.

## Hard-gate checklist

Verify at least:

- participant eligibility and team composition;
- knowledge-test requirement;
- track and topic eligibility;
- deadline and submission system;
- body/appendix separation and page or word limits;
- required file formats and naming;
- anonymity of school, student, teacher, logo, acknowledgments, metadata, and screenshots;
- plagiarism or similarity threshold;
- original-work and prior-submission rules;
- AI tool permission, disclosure, and independent-core-work requirement;
- raw data, code, consent, and provenance expectations;
- map source, boundary completeness, and required approval number;
- citations, copyrighted material, images, fonts, icons, generated media, and privacy;
- lawful, non-misleading use of competition names and documented permission for organizer marks, enterprise marks, logos, characters, and other protected brand assets when required;
- anonymity in visible content, master pages, image metadata, SVG metadata, filenames, alt text, speaker notes, and hidden layers;
- presentation time, participants, language, and equipment.

## AI use

Use AI only as permitted by the applicable rule. Maintain an AI-use ledger with date, tool/model, purpose, input category, output use, human verification, and final responsibility. Never upload personal or confidential respondent data to an external model without authorization and de-identification.

AI may assist with brainstorming, code, editing, chart drafts, image generation, or review when allowed. The team must independently own the core investigation, evidence, analysis, conclusions, and defense. Include the required disclosure in the appendix.

For generated visual assets, record the tool/model, purpose, input category, prompt reference, source or parent asset, output path, human verification, rights review, and final responsibility. Never upload identifiable respondent images, personal data, confidential enterprise material, or unreleased competition material to an image-generation system without authorization and de-identification.

## Brand and visual isolation

证见 EVI-X is an independent, non-official agent identity. Do not present it as the organizer, an authorized competition partner, an official judging system, or a guarantee of winning. Do not reproduce or closely imitate an official competition, organizer, enterprise, or university mark without documented permission.

Set `visual.mode` to exactly one of `agent_ui`, `public_promo`, or `competition_submission` before selecting assets. The first two may use approved EVI-X brand assets. A competition submission must default to a neutral or project-specific system; exclude the EVI-X logo, IP character, credit line, filenames, metadata, and other identity signals whenever anonymity applies. If the applicable rule is unknown, treat brand insertion as blocked rather than assumed safe.

Use only assets with traceable provenance and rights status. Preserve the approved master for IP derivatives, keep generated outputs versioned, and distinguish concept drafts from approved assets. Generated illustrations are not evidence and must not imply that simulated people, places, products, or fieldwork are real.

## Integrity

Never fabricate or backfill fieldwork. Preserve raw data as read-only evidence. Log every exclusion and transformation. Separate actual evidence from proposed evidence and simulated examples.

Flag privacy, consent, minors, sensitive attributes, health, financial, location, and platform-data risks. Minimize collection and de-identify outputs.

## Preflight output

Return each item as `pass`, `fail`, `warning`, or `unknown`, with source, artifact evidence, owner, and deadline. Include visual rights, AI-generation provenance, hidden identity signals, and rendered-output inspection. A hard `unknown` remains unresolved; do not silently pass it.

Run `audit_submission_files.py --strict` on the exact frozen DOCX, PPTX, and PDF files, supplying every forbidden school, team, teacher, student, enterprise, and author term with repeated `--forbidden-term` options when anonymity applies. Inspect, at minimum:

- filename, Office/PDF core properties, custom properties, author and last-modifier fields;
- ZIP prefix/trailer/comment integrity, case-normalized part names, comments, tracked revisions, package thumbnails, hidden slides, speaker notes, master/hidden content, custom XML, renamed macro/ActiveX/OLE/package/remote-template relationships, embedded objects, and external links;
- Office raster EXIF/XMP/IPTC/GPS/comment fields, plus PDF full-xref metadata streams, encoded-image metadata, page thumbnails, outlines, actions, forms, layers, associated files, attachments, incremental revisions, and unreachable objects;
- whether exported file SHA-256, byte count, and page/slide count match the human-reviewed render;
- whether a later export invalidated the prior metadata scan, render review, or approval.

The final frozen Office package must contain no package thumbnail, ZIP comment/extra data, active-content relationship, or macro-enabled content type. A stale preview, renamed target, or trailing polyglot payload can expose an old cover or identity outside rendered pages. The final PPTX must also contain no non-empty speaker notes or hidden slides. A frozen PDF must have a clean physical boundary and no page thumbnail, dynamic form/XFA, hidden optional layer, associated file, dangerous action, incremental history, or unauditable reachable object. Keep delivery cues in a separately registered `defense` artifact; do not rely on deciding whether hidden content is "benign". Under strict final-stage audit, each of these is blocking.

The script is a lower-bound binary inspection, not proof of anonymity. Human review must still inspect rendered pages, screenshots, photos, alt text, image pixels, linked objects, filenames inside archives, and applicable official rules. At final stages, `competition.anonymity_required` must be resolved; when it is `yes`, the complete school/team/member/teacher/enterprise forbidden-term list must be configured. Unknown or required-but-empty configuration is No-Go.
