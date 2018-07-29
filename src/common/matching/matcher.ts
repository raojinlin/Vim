import * as vscode from 'vscode';

import { TextEditor } from './../../textEditor';
import { Position, PositionDiff } from './../motion/position';
import { configuration } from '../../configuration/configuration';

/**
 * PairMatcher finds the position matching the given character, respecting nested
 * instances of the pair.
 */
export class PairMatcher {
  static pairings: {
    [key: string]: {
      match: string;
      isNextMatchForward: boolean;
      directionless?: boolean;
      matchesWithPercentageMotion?: boolean;
    };
  } = {
    '(': { match: ')', isNextMatchForward: true, matchesWithPercentageMotion: true },
    '{': { match: '}', isNextMatchForward: true, matchesWithPercentageMotion: true },
    '[': { match: ']', isNextMatchForward: true, matchesWithPercentageMotion: true },
    ')': { match: '(', isNextMatchForward: false, matchesWithPercentageMotion: true },
    '}': { match: '{', isNextMatchForward: false, matchesWithPercentageMotion: true },
    ']': { match: '[', isNextMatchForward: false, matchesWithPercentageMotion: true },

    // These characters can't be used for "%"-based matching, but are still
    // useful for text objects.
    '<': { match: '>', isNextMatchForward: true },
    '>': { match: '<', isNextMatchForward: false },
    // These are useful for deleting closing and opening quotes, but don't seem to negatively
    // affect how text objects such as `ci"` work, which was my worry.
    '"': { match: '"', isNextMatchForward: false, directionless: true },
    "'": { match: "'", isNextMatchForward: false, directionless: true },
    '`': { match: '`', isNextMatchForward: false, directionless: true },
  };

  private static findPairedChar(
    position: Position,
    charToFind: string,
    charToStack: string,
    stackHeight,
    isNextMatchForward: boolean
  ): Position | undefined {
    let lineNumber = position.line;
    let linePosition = position.character;
    let lineCount = TextEditor.getLineCount();
    let cursorChar = TextEditor.getCharAt(position);
    let selection = TextEditor.getSelection();
    if (selection.start.isEqual(selection.end) && cursorChar === charToFind) {
      return position;
    }

    while (PairMatcher.keepSearching(lineNumber, lineCount, isNextMatchForward)) {
      let lineText = TextEditor.getLineAt(new Position(lineNumber, 0)).text.split('');
      const originalLineLength = lineText.length;
      if (lineNumber === position.line) {
        if (isNextMatchForward) {
          lineText = lineText.slice(linePosition + 1, originalLineLength);
        } else {
          lineText = lineText.slice(0, linePosition);
        }
      }

      while (true) {
        if (lineText.length <= 0 || stackHeight <= -1) {
          break;
        }

        let nextChar: string | undefined;
        if (isNextMatchForward) {
          nextChar = lineText.shift();
        } else {
          nextChar = lineText.pop();
        }

        if (nextChar === charToStack) {
          stackHeight++;
        } else if (nextChar === charToFind) {
          stackHeight--;
        } else {
          continue;
        }
      }

      if (stackHeight <= -1) {
        let pairMemberChar: number;
        if (isNextMatchForward) {
          pairMemberChar = Math.max(0, originalLineLength - lineText.length - 1);
        } else {
          pairMemberChar = lineText.length;
        }
        return new Position(lineNumber, pairMemberChar);
      }

      if (isNextMatchForward) {
        lineNumber++;
      } else {
        lineNumber--;
      }
    }
    return undefined;
  }

  private static keepSearching(lineNumber, lineCount, isNextMatchForward) {
    if (isNextMatchForward) {
      return lineNumber <= lineCount - 1;
    } else {
      return lineNumber >= 0;
    }
  }

  static nextPairedChar(
    position: Position,
    charToMatch: string,
    closed: boolean = true
  ): Position | undefined {
    /**
     * We do a fairly basic implementation that only tracks the state of the type of
     * character you're over and its pair (e.g. "[" and "]"). This is similar to
     * what Vim does.
     *
     * It can't handle strings very well - something like "|( ')' )" where | is the
     * cursor will cause it to go to the ) in the quotes, even though it should skip over it.
     *
     * PRs welcomed! (TODO)
     * Though ideally VSC implements https://github.com/Microsoft/vscode/issues/7177
     */
    const pairing = this.pairings[charToMatch];

    if (pairing === undefined || pairing.directionless) {
      return undefined;
    }

    const stackHeight = 0;
    let matchedPos: Position | undefined;
    const charToFind = pairing.match;
    const charToStack = charToMatch;

    matchedPos = PairMatcher.findPairedChar(
      position,
      charToFind,
      charToStack,
      stackHeight,
      pairing.isNextMatchForward
    );

    if (matchedPos) {
      return matchedPos;
    }
    // TODO(bell)
    return undefined;
  }

  /**
   * Given a current position, find an immediate following bracket and return the range. If
   * no matching bracket is found immediately following the opening bracket, return undefined.
   */
  static immediateMatchingBracket(currentPosition: Position): vscode.Range | undefined {
    // Don't delete bracket unless autoClosingBrackets is set
    if (!configuration.getConfiguration().get('editor.autoClosingBrackets')) {
      return undefined;
    }

    const deleteRange = new vscode.Range(
      currentPosition,
      currentPosition.getLeftThroughLineBreaks()
    );
    const deleteText = vscode.window.activeTextEditor!.document.getText(deleteRange);
    let matchRange: vscode.Range | undefined;
    let isNextMatch = false;

    if ('{[("\'`'.indexOf(deleteText) > -1) {
      const matchPosition = currentPosition.add(new PositionDiff(0, 1));
      matchRange = new vscode.Range(matchPosition, matchPosition.getLeftThroughLineBreaks());
      isNextMatch =
        vscode.window.activeTextEditor!.document.getText(matchRange) ===
        PairMatcher.pairings[deleteText].match;
    }

    if (isNextMatch && matchRange) {
      return matchRange;
    }

    return undefined;
  }
}
