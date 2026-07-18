/**
 * Minimal Rego syntax highlighting for CodeMirror 6.
 *
 * The official @codemirror/legacy-modes package doesn't ship a Rego mode.
 * This is a small StreamLanguage definition covering the common Rego v1
 * surface: keywords, comments, strings, numbers, and operators.
 *
 * Future: replace with a proper Lezer grammar for full AST-level highlighting.
 */
import { StreamLanguage } from '@codemirror/language';

const KEYWORDS = new Set([
	'package', 'import', 'as', 'default', 'else', 'false', 'if', 'in', 'null',
	'some', 'not', 'true', 'with', 'contains', 'every', 'internal',
]);

interface State {
	inString: false | '"' | '`';
	inComment: boolean;
	keywordChecked: boolean;
}

function startState(): State {
	return { inString: false, inComment: false, keywordChecked: false };
}

// StreamLanguage parser definition. Each method receives the stream and
// returns either the token type for the consumed atom or null to skip.
export const regoLanguage = StreamLanguage.define({
	name: 'rego',
	startState: startState,
	copyState: (s) => ({ ...s }),
	token: (stream, state) => {
		// Comment line — single # until EOL.
		if (state.inComment || stream.peek() === '#') {
			stream.skipToEnd();
			state.inComment = false;
			return 'comment';
		}

		// String literals.
		if (state.inString) {
			let escaped = false;
			while (!stream.eol()) {
				const ch = stream.next() as string;
				if (escaped) { escaped = false; continue; }
				if (ch === '\\') { escaped = true; continue; }
				if (ch === state.inString) {
					state.inString = false;
					return 'string';
				}
			}
			return 'string';
		}
		const startChar = stream.peek();
		if (startChar === '"' || startChar === '`') {
			state.inString = startChar as '"' | '`';
			stream.next();
			return 'string';
		}

		// Whitespace.
		if (stream.eatSpace()) return null;

		// Numbers.
		if (/[0-9]/.test(startChar as string)) {
			stream.match(/^[0-9]+(\.[0-9]+)?/);
			return 'number';
		}

		// Identifiers + keywords.
		if (/[a-zA-Z_]/.test(startChar as string)) {
			const m = stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
			if (m && typeof m !== 'boolean' && KEYWORDS.has(m[0])) return 'keyword';
			// Function call (followed by paren)?
			const after = stream.peek();
			if (after === '(') return 'def';
			return 'variable';
		}

		// Operators + punctuation.
		if (/[+\-*/%=<>!&|^~]/.test(startChar as string)) {
			stream.next();
			return 'operator';
		}

		// Strings indicators (already handled), braces, etc.
		stream.next();
		return null;
	},
	languageData: {
		commentTokens: { line: '#' },
	},
});
