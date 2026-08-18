export default function ConfigMissingPage() {
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <h1 className="auth-title">Setup needed</h1>
        <p>
          This app can't connect to Supabase yet because its environment variables aren't set.
        </p>
        <p>
          Create a file named <code>.env</code> in the project's root folder (the same folder as{' '}
          <code>package.json</code>) containing:
        </p>
        <pre className="code-block">
{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key`}
        </pre>
        <p>
          You'll find both values in your Supabase project under{' '}
          <strong>Project Settings → API Keys</strong> (or via the <strong>Connect</strong> button on
          the project dashboard).
        </p>
        <p>
          After saving <code>.env</code>, stop the dev server (<code>Ctrl+C</code> in the terminal)
          and run <code>npm run dev</code> again — Vite only reads <code>.env</code> when it starts.
        </p>
        <p>
          Deploying to Netlify instead? Add the same two variables under{' '}
          <strong>Site configuration → Environment variables</strong>, then trigger a new deploy.
        </p>
      </div>
    </div>
  );
}
