import { guardSuperAdminAccess } from "@/lib/admin-guard";
import { listAdmins } from "@/lib/admins";
import { listExamSettings } from "@/lib/exam-settings";
import { AdminsManager } from "@/components/admin/settings/admins-manager";
import { ExamSettingsManager } from "@/components/admin/settings/exam-settings-manager";

// Admins & settings (M6-S9, superadmin-only) — the console's own operators plus
// the JET exam settings. The route guard redirects a plain admin to /admin.

export default async function SettingsPage() {
  const { admin } = await guardSuperAdminAccess();
  const [admins, exams] = await Promise.all([listAdmins(), listExamSettings()]);

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Admin console</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">
          Admins &amp; settings
        </h1>
      </header>

      <div className="flex flex-col gap-12">
        <section>
          <h2 className="mb-1 text-sm font-semibold text-fg">Admins</h2>
          <p className="mb-4 text-xs text-fg-muted">
            Console operators. Super admins can manage admins and settings; the last active super
            admin is protected.
          </p>
          <AdminsManager admins={admins} currentAdminId={admin.id} />
        </section>

        <div className="border-t border-hairline" />

        <section>
          <h2 className="mb-1 text-sm font-semibold text-fg">Exams</h2>
          <p className="mb-4 text-xs text-fg-muted">
            JET exam settings — questions per quiz, time limit, and levels. Create an exam here,
            then add its questions on the Questions page.
          </p>
          <ExamSettingsManager exams={exams} />
        </section>
      </div>
    </div>
  );
}
