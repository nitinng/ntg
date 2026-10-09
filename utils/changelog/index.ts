import changelogMarkdown from '../../version-and-changelog.md?raw';
import { parseChangelog } from './parseChangelog';

export type {
  ChangelogCommit,
  ChangelogCommitType,
  ChangelogHighlight,
  ChangelogRelease
} from './parseChangelog';
export { parseChangelog, inferCommitType } from './parseChangelog';

/** Raw contents of `version-and-changelog.md`, bundled at build time. */
export const CHANGELOG_MARKDOWN = changelogMarkdown;

/** Release history parsed from the markdown, newest first. */
export const RELEASES = parseChangelog(CHANGELOG_MARKDOWN);

/** Version of the newest documented release, e.g. `v2.7.0`. */
export const APP_VERSION = RELEASES[0]?.version ?? 'v0.0.0';
