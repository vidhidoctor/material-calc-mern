import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Decimal } from '../src/calculation/decimal.js';
import { evaluateFormula, formulaNames, FormulaError, parseFormula } from '../src/calculation/formula.js';

const run = (formula: string, vars: Record<string, number> = {}) =>
  evaluateFormula(parseFormula(formula), new Map(Object.entries(vars).map(([k, v]) => [k.toUpperCase(), new Decimal(v)]))).toString();

describe('formula parser and evaluator', () => {
  it('follows operator precedence, brackets and unary minus', () => {
    assert.equal(run('1 + 2 * 3'), '7');
    assert.equal(run('(1 + 2) * 3'), '9');
    assert.equal(run('10 / 4'), '2.5');
    assert.equal(run('-2 * -3'), '6');
    assert.equal(run('8 - 2 - 1'), '5');
    assert.equal(run('12 / 2 / 3'), '2');
  });

  it('accepts × ÷ − symbols and decimals', () => {
    assert.equal(run('3 × 4 ÷ 2 − 1'), '5');
    assert.equal(run('0.1 + 0.2'), '0.3');
    assert.equal(run('.5 * 4'), '2');
  });

  it('uses names case-insensitively', () => {
    assert.equal(run('TOTAL / seqPerCd', { total: 8861475, SEQPERCD: 31600 }).slice(0, 8), '280.4264');
    assert.deepEqual([...formulaNames(parseFormula('total * Denier / 9000'))], ['TOTAL', 'DENIER']);
  });

  it('rejects bad formulas with readable errors', () => {
    assert.throws(() => parseFormula(''), /empty/);
    assert.throws(() => parseFormula('1 +'), /ends too early/);
    assert.throws(() => parseFormula('(1 + 2'), /not closed/);
    assert.throws(() => parseFormula('1 + 2)'), /Unexpected “\)”/);
    assert.throws(() => parseFormula('2 ** 3'), /Unexpected “\*”/);
    assert.throws(() => parseFormula('alert(1); 2'), FormulaError);
    assert.throws(() => parseFormula('a b'), /Unexpected “B”/);
  });

  it('reports unknown names and division by zero at evaluation', () => {
    assert.throws(() => run('x + 1'), /No value for “X”/);
    assert.throws(() => run('1 / (3 - 3)'), /Division by zero/);
  });
});
