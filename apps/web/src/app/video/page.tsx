import { VideoPlayer } from './video-player';

export default function VideoPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-2xl space-y-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Video Demo</h1>
        <p className="text-lg text-muted-foreground">
          Remotion Player embedding powered by @repo/video compositions.
        </p>
      </div>

      <div className="mt-12 w-full max-w-4xl">
        <VideoPlayer />
      </div>
    </main>
  );
}
