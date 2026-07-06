// Empty / pending states. Inline `Empty` is the quiet in-panel line; EmptyPage
// is a centered card for a whole route with nothing to show yet.
import { Card } from "./Card.tsx";

export function Empty({ text = "No data in range" }: { text?: string }) {
  return <p className="empty">{text}</p>;
}

export function EmptyPage({ title, note }: { title: string; note?: string }) {
  return (
    <Card className="empty-page">
      <div className="empty-title">{title}</div>
      {note && <div className="empty-note">{note}</div>}
    </Card>
  );
}
