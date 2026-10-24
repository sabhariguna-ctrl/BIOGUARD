import { useAuth } from '../store/auth.js';
import BulkInvite from '../components/BulkInvite.jsx';
import { Page } from '../components/ui.jsx';

export default function InviteStudents() {
  const role = useAuth((s) => s.user.role);
  return (
    <Page title="Invite people" subtitle="Add your whole class in one go. Everyone receives an email, sets a password, verifies automatically, and can enroll right away.">
      <BulkInvite roles={role === 'admin' ? ['student', 'faculty'] : ['student']} />
    </Page>
  );
}
