import type { Agent, SocialPost } from '@/lib/schemas';
import type { ConnectorStatus } from '@/lib/connectors/types';
import { socialSourceBadge } from '@/lib/social';

/**
 * The content-creation crew: the Marketing/Growth pillar, where the content
 * agent and its OneUp publisher (`social-pulse`) + creative workers live. The
 * lead comes first, then the workers alphabetically.
 */
export const CONTENT_DEPT_ID = 'dept-marketing-growth';

export function contentAgents(agents: Agent[]): Agent[] {
  const isLead = (a: Agent) => (a.tier === 'lead' || a.parentId === null ? 0 : 1);
  return agents
    .filter((a) => a.departmentId === CONTENT_DEPT_ID)
    .sort((a, b) => isLead(a) - isLead(b) || a.name.localeCompare(b.name));
}

export type ContentPipelineStatus = {
  /** Short count/status string for the section header. */
  countLabel: string;
  /** true only when OneUp is connected AND real published-post rows exist. */
  connectedWithData: boolean;
  /** Real published-post count backing `connectedWithData` — 0 otherwise. */
  publishedCount: number;
  /** Body copy for the empty/placeholder card. */
  bodyText: string;
};

/**
 * Honest content-pipeline status for /content — reads the SAME OneUp
 * connector state /social and /integrations read (`allConnectorStatuses()`
 * -> oneupStatus()), never a fresh guess, via the shared `socialSourceBadge`
 * helper /social already uses for its own badge. Before this fix /content's
 * "Content pipeline" section hardcoded "No posting source is connected"
 * unconditionally, disagreeing with /social ("OneUp connected · no synced
 * data yet") and /integrations ("OneUp CONNECTED") the moment ONEUP_API_KEY
 * was set. Three honest states, not two: not connected / connected but
 * nothing synced yet / connected with real synced posts — never collapsed
 * into a blanket "connected" claim.
 */
export function contentPipelineStatus(
  oneup: Pick<ConnectorStatus, 'state'>,
  publishedPosts: SocialPost[],
): ContentPipelineStatus {
  const badge = socialSourceBadge(oneup);
  const publishedCount = publishedPosts.length;

  if (oneup.state === 'connected' && publishedCount > 0) {
    return {
      countLabel: `${publishedCount} published`,
      connectedWithData: true,
      publishedCount,
      bodyText: `${publishedCount} post${publishedCount === 1 ? '' : 's'} published via OneUp.`,
    };
  }

  const countLabel =
    oneup.state === 'connected' ? 'no synced data yet' : oneup.state === 'error' ? 'connector error' : 'no source connected';

  return {
    countLabel,
    connectedWithData: false,
    publishedCount: 0,
    bodyText: badge.emptyPostsDetail,
  };
}
