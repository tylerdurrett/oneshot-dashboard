import Link from 'next/link';

const prototypes = [
  { href: '/prototype/chat', title: 'Fullscreen Chat', description: 'A fullscreen chat UI with mock messages exercising the AI Elements components.' },
];

export default function PrototypeIndex() {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-16">
      <div className="w-full max-w-2xl space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Prototypes</h1>
        <p className="text-muted-foreground">
          A sandbox for exploring UI ideas. Each prototype is a standalone page with full visual control.
        </p>
      </div>

      <ul className="mt-10 w-full max-w-2xl space-y-3">
        {prototypes.map((proto) => (
          <li key={proto.href}>
            <Link
              href={proto.href}
              className="block rounded-lg border border-border p-4 transition-colors hover:bg-accent"
            >
              <span className="font-medium">{proto.title}</span>
              <p className="mt-1 text-sm text-muted-foreground">{proto.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
