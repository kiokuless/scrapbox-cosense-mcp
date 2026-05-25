import { patch } from '@cosense/std/websocket';
import type { BaseLine } from '@cosense/types/rest';
import { formatError, stringifyError } from '../../utils/format.js';

export interface DeleteLinesParams {
  pageTitle: string;
  targetLineText: string;
  deleteCount?: number | undefined;
  projectName?: string | undefined;
  compact?: boolean | undefined;
}

export async function handleDeleteLines(
  defaultProjectName: string,
  cosenseSid: string | undefined,
  params: DeleteLinesParams
) {
  const projectName = params.projectName || defaultProjectName;

  try {
    if (!cosenseSid) {
      return formatError('Authentication required: COSENSE_SID is needed for page editing', {
        Operation: 'delete_lines',
        Project: projectName,
        Page: params.pageTitle,
        Timestamp: new Date().toISOString(),
      }, params.compact);
    }

    const deleteCount = params.deleteCount ?? 1;
    if (!Number.isInteger(deleteCount) || deleteCount < 1) {
      return formatError('deleteCount must be a positive integer', {
        Operation: 'delete_lines',
        Project: projectName,
        Page: params.pageTitle,
        'Target line': `"${params.targetLineText}"`,
        Timestamp: new Date().toISOString(),
      }, params.compact);
    }

    let deletedLinesCount = 0;
    let failureMessage: string | undefined;

    const result = await patch(projectName, params.pageTitle, (lines: BaseLine[]) => {
      const targetIndex = lines.findIndex((line: BaseLine) =>
        line.text === params.targetLineText
      );

      if (targetIndex < 0) {
        failureMessage = `Target line not found: "${params.targetLineText}"`;
        return lines;
      }

      if (targetIndex === 0) {
        failureMessage = 'Cannot delete the page title line';
        return lines;
      }

      const deleteEndIndex = Math.min(targetIndex + deleteCount, lines.length);
      deletedLinesCount = deleteEndIndex - targetIndex;

      return [
        ...lines.slice(0, targetIndex),
        ...lines.slice(deleteEndIndex)
      ];
    }, {
      sid: cosenseSid
    });

    if (!result.ok) {
      throw new Error(`WebSocket patch failed: ${stringifyError(result.err)}`);
    }

    if (failureMessage) {
      return formatError(failureMessage, {
        Operation: 'delete_lines',
        Project: projectName,
        Page: params.pageTitle,
        'Target line': `"${params.targetLineText}"`,
        Timestamp: new Date().toISOString(),
      }, params.compact);
    }

    if (params.compact) {
      return {
        content: [{
          type: "text",
          text: `deleted: ${deletedLinesCount} lines from ${params.pageTitle}`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: [
          'Successfully deleted lines from page',
          `Operation: delete_lines`,
          `Project: ${projectName}`,
          `Page: ${params.pageTitle}`,
          `Target line: "${params.targetLineText}"`,
          `Deleted lines: ${deletedLinesCount}`,
          `Timestamp: ${new Date().toISOString()}`
        ].join('\n')
      }]
    };

  } catch (error) {
    return formatError(
      error instanceof Error ? error.message : 'Unknown error',
      {
        Operation: 'delete_lines',
        Project: projectName,
        Page: params.pageTitle,
        'Target line': `"${params.targetLineText}"`,
        Timestamp: new Date().toISOString(),
      },
      params.compact
    );
  }
}
