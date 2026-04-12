export default function GmailLabelSelector({
  labels,
}: {
  labels: Array<{ id: string; name: string; kind: string }>;
}) {
  return (
    <div className="rounded-xl border p-4">
      <h2 className="mb-3 text-lg font-medium">Gmail Labels</h2>
      <ul className="space-y-2 text-sm">
        {labels.length === 0 ? <li className="text-muted-foreground">暂无已选择标签</li> : null}
        {labels.map((label) => (
          <li key={label.id}>
            {label.name}
            <span className="ml-2 text-xs text-muted-foreground">{label.kind}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
