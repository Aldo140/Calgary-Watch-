import { Component, type ReactNode } from "react";
import { AdminButton, Panel, T } from "./ui";
export class AdminSectionBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; attempt: number; message:string }
> {
  state = { failed: false, attempt: 0, message:"" };
  static getDerivedStateFromError(error:unknown) {
    return { failed: true, message:error instanceof Error?error.message:"Unknown workspace error" };
  }
  componentDidCatch(error: Error) {
    console.error("[admin workspace]", error);
  }
  render() {
    return this.state.failed ? (
      <Panel title="This workspace could not open">
        <p role="alert" style={{ color: T.critical }}>
          Your other admin tools are still available. Retry this workspace or
          choose another section.
        </p>
        <details className="mt-3 mb-3"><summary>Error details</summary><p className="break-words">{this.state.message}</p></details>
        <div className="flex flex-wrap gap-2"><AdminButton
          onClick={() =>
            this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))
          }
        >
          Retry workspace
        </AdminButton>
        <AdminButton variant="outline" onClick={()=>window.location.reload()}>Reload admin</AdminButton></div>
      </Panel>
    ) : (
      <div key={this.state.attempt} className="admin-section-content">
        {this.props.children}
      </div>
    );
  }
}
