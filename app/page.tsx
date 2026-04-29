export default function Home() {
  return (
    <main className="min-h-screen bg-sapien-navy flex flex-col items-center justify-center">
      <div className="text-center">
        <h1
          className="text-white text-6xl font-display font-light tracking-tight mb-4"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Sapien
        </h1>
        <div
          className="h-0.5 w-12 mx-auto mb-6"
          style={{ background: "#0BB5AD" }}
        />
        <p
          className="text-sm font-light tracking-widest uppercase"
          style={{
            color: "rgba(255,255,255,0.5)",
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          Where Thinking Grows.
        </p>
      </div>
    </main>
  );
}
