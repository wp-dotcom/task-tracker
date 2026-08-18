export default function FullPageSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="full-page-spinner">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
