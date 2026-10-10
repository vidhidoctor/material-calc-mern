// Safe arithmetic formulas for material categories, e.g. "TOTAL / seqPerCd" or "GRAMS / 1000".
// Supports numbers, names, + - * / (also × ÷ −) and brackets. Never uses eval. Names are
// case-insensitive (compared upper-case). Pure: no Mongoose, no Express.
import { Decimal } from './decimal.js';

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

export type FormulaNode =
  | { type: 'num'; value: string }
  | { type: 'name'; name: string }
  | { type: 'neg'; arg: FormulaNode }
  | { type: 'bin'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode };

type Token =
  | { t: 'num'; v: string; at: number }
  | { t: 'name'; v: string; at: number }
  | { t: 'op'; v: '+' | '-' | '*' | '/'; at: number }
  | { t: '(' | ')'; at: number };

const OPERATORS: Record<string, '+' | '-' | '*' | '/'> = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '/': '/', '÷': '/' };

export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const match = /^\d*\.?\d+|^\d+\.?/.exec(source.slice(i));
      if (!match) throw new FormulaError(`Invalid number at position ${i + 1}.`);
      tokens.push({ t: 'num', v: match[0], at: i });
      i += match[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))!;
      tokens.push({ t: 'name', v: match[0].toUpperCase(), at: i });
      i += match[0].length;
    } else if (OPERATORS[ch]) {
      tokens.push({ t: 'op', v: OPERATORS[ch], at: i });
      i++;
    } else if (ch === '(' || ch === ')') {
      tokens.push({ t: ch, at: i });
      i++;
    } else {
      throw new FormulaError(`Unexpected “${ch}” at position ${i + 1}. Use numbers, names, + − × ÷ and brackets.`);
    }
  }
  return tokens;
}

/** Parses a formula into a tree; throws FormulaError with a readable message. */
export function parseFormula(source: string): FormulaNode {
  const tokens = tokenize(source);
  if (tokens.length === 0) throw new FormulaError('Formula is empty.');
  let pos = 0;

  const peek = () => tokens[pos];
  const describe = (token: Token | undefined) =>
    !token ? 'the end of the formula' : token.t === 'num' || token.t === 'name' ? `“${token.v}”` : token.t === 'op' ? `“${token.v}”` : `“${token.t}”`;

  function expression(): FormulaNode {
    let node = term();
    for (let token = peek(); token?.t === 'op' && (token.v === '+' || token.v === '-'); token = peek()) {
      pos++;
      node = { type: 'bin', op: token.v, left: node, right: term() };
    }
    return node;
  }

  function term(): FormulaNode {
    let node = factor();
    for (let token = peek(); token?.t === 'op' && (token.v === '*' || token.v === '/'); token = peek()) {
      pos++;
      node = { type: 'bin', op: token.v, left: node, right: factor() };
    }
    return node;
  }

  function factor(): FormulaNode {
    const token = peek();
    if (!token) throw new FormulaError('The formula ends too early.');
    if (token.t === 'op' && (token.v === '-' || token.v === '+')) {
      pos++;
      const arg = factor();
      return token.v === '-' ? { type: 'neg', arg } : arg;
    }
    if (token.t === 'num') {
      pos++;
      return { type: 'num', value: token.v };
    }
    if (token.t === 'name') {
      pos++;
      return { type: 'name', name: token.v };
    }
    if (token.t === '(') {
      pos++;
      const node = expression();
      if (peek()?.t !== ')') throw new FormulaError('A bracket is not closed.');
      pos++;
      return node;
    }
    throw new FormulaError(`Unexpected ${describe(token)} at position ${token.at + 1}.`);
  }

  const tree = expression();
  if (pos < tokens.length) throw new FormulaError(`Unexpected ${describe(tokens[pos])} at position ${tokens[pos]!.at + 1}.`);
  return tree;
}

/** Every name used in the formula (upper-case). */
export function formulaNames(node: FormulaNode, into = new Set<string>()): Set<string> {
  if (node.type === 'name') into.add(node.name);
  else if (node.type === 'neg') formulaNames(node.arg, into);
  else if (node.type === 'bin') {
    formulaNames(node.left, into);
    formulaNames(node.right, into);
  }
  return into;
}

/** Evaluates with exact decimals. Unknown names and division by zero throw FormulaError. */
export function evaluateFormula(node: FormulaNode, values: ReadonlyMap<string, Decimal>): Decimal {
  switch (node.type) {
    case 'num':
      return new Decimal(node.value);
    case 'name': {
      const value = values.get(node.name);
      if (value === undefined) throw new FormulaError(`No value for “${node.name}”.`);
      return value;
    }
    case 'neg':
      return evaluateFormula(node.arg, values).negated();
    case 'bin': {
      const left = evaluateFormula(node.left, values);
      const right = evaluateFormula(node.right, values);
      if (node.op === '+') return left.plus(right);
      if (node.op === '-') return left.minus(right);
      if (node.op === '*') return left.times(right);
      if (right.isZero()) throw new FormulaError('Division by zero.');
      return left.dividedBy(right);
    }
  }
}
