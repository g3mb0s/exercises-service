import { evaluateExercise, evaluateFillGapChoice, isEntryAccessible, orderCourseEntries } from './progress.service';

describe('fill_gap_choice evaluation', () => {
  const payload = {
    type: 'fill_gap_choice',
    settings: { caseSensitive: false },
    content: { items: [{ id: 'item-1', text: 'She {{verb}} home.', gaps: [{ key: 'verb', answers: ['goes'] }] }] },
  };

  it('passes a correct answer without case sensitivity', () => {
    expect(evaluateFillGapChoice(payload, { answers: [{ itemId: 'item-1', gaps: { verb: ' Goes ' } }] })).toMatchObject({ passed: true, correct: 1, total: 1, score: 1 });
  });

  it('returns a partial score instead of exposing answers', () => {
    const result = evaluateFillGapChoice(payload, { answers: [{ itemId: 'item-1', gaps: { verb: 'go' } }] });
    expect(result).toMatchObject({ passed: false, correct: 0, total: 1, score: 0 });
    expect(result.details[0]).toEqual({ itemId: 'item-1', key: 'verb', correct: false });
  });
});

describe('exercise evaluation', () => {
  it('accepts configured alternatives for text gaps', () => {
    const payload = { settings: { caseSensitive: false }, content: { items: [{ id: 'one', gaps: [{ key: 'verb', answers: ['goes'], acceptedAnswers: ['is going'] }] }] } };
    expect(evaluateExercise('fill_gap_input', payload, { items: [{ itemId: 'one', gaps: { verb: 'Is Going' } }] })).toMatchObject({ passed: true, score: 1 });
  });

  it('checks matching pairs without exposing the expected right side', () => {
    const payload = { content: { items: [{ left: [], right: [], pairs: [['left-1', 'right-2'], ['left-2', 'right-1']] }] } };
    const result = evaluateExercise('matching', payload, { items: [{ itemId: 'item-0', pairs: [['left-1', 'right-2'], ['left-2', 'wrong']] }] });
    expect(result).toMatchObject({ passed: false, correct: 1, total: 2, score: 0.5 });
    expect(result.details).toEqual([{ itemId: 'item-0', key: 'left-1', correct: true }, { itemId: 'item-0', key: 'left-2', correct: false }]);
  });

  it.each(['sentence_from_audio', 'sentence_from_translation'])('checks word order for %s', (type) => {
    const payload = { content: { items: [{ words: [], answer: ['word-2', 'word-1'] }] } };
    expect(evaluateExercise(type, payload, { items: [{ itemId: 'item-0', answer: ['word-2', 'word-1'] }] })).toMatchObject({ passed: true, correct: 1, total: 1 });
  });
});

describe('course entry order', () => {
  it('orders entries by section, unit, and entry positions', () => {
    const items = [
      { itemId: 'entry-2', itemType: 'entry', parentItemId: 'unit-1', position: 1 },
      { itemId: 'section-1', itemType: 'section', parentItemId: 'course', position: 0 },
      { itemId: 'entry-1', itemType: 'entry', parentItemId: 'unit-1', position: 0 },
      { itemId: 'unit-1', itemType: 'unit', parentItemId: 'section-1', position: 0 },
    ];
    expect(orderCourseEntries(items).map((item) => item.itemId)).toEqual(['entry-1', 'entry-2']);
  });

  it('allows completed and first incomplete entries but locks future entries', () => {
    const ordered = ['entry-1', 'entry-2', 'entry-3'];
    const completed = new Set(['entry-1']);
    expect(isEntryAccessible(ordered, completed, 'entry-1')).toBe(true);
    expect(isEntryAccessible(ordered, completed, 'entry-2')).toBe(true);
    expect(isEntryAccessible(ordered, completed, 'entry-3')).toBe(false);
  });
});
