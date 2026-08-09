# Reader feedback rule loop

Use this loop when a reader says the prose feels like an essay, a chronology,
generic AI text, or a poor fit for Fanqie. Raw feedback is evidence; it gains
production force only after it becomes a concise, testable rule.

## Source table

Add one row to `state/feedback-ledger.md`:

`日期 | 反馈原句 | 问题层 | 规则化动作 | 复验章节 | 状态`

- `规则化动作` states one observable instruction, such as “第一段用动作或对
  抗开场；删去总结句，改写成立即后果”。
- `复验章节` is the first chapter whose cold reader must check that rule.
- Use `active` while the rule governs production. Use `resolved` only after a
  passing recheck has replaced the original failure evidence.

## Execution

```powershell
node scripts/feedback-rules.js compile <PROJECT>
```

The normal chapter transaction runs this command before building the context
pack. It writes `state/feedback-rules.json`, which is included as critical
context in drafting and revision.

For every active rule due at the target chapter, the independent cold reader
must emit one literal-evidence check: `pass`, `fail`, or `not_applicable`.
`fail` requires a source quote, forces `revise`, and is retained in chapter QA.
The compiler never overwrites the feedback ledger or the style guide.
