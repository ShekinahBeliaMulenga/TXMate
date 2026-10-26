import ChangePasswordForm from "@/components/student/change-password-form";
import { Panel } from "./settings-ui";

/** Wraps the existing change-password form, which owns its own submit and validation. */
export default function PasswordSection() {
  return (
    <Panel>
      <ChangePasswordForm />
    </Panel>
  );
}
