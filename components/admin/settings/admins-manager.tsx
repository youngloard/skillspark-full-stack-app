"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAdmin, deleteAdmin, updateAdmin } from "@/actions/admins";
import type { ApiResult } from "@/lib/api-response";
import type { AdminListItem } from "@/lib/admins";
import { useToast } from "@/components/admin/toast";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { Checkbox } from "@/components/admin/checkbox";
import {
  MobileDetail,
  MobileDetailGrid,
  MobileExpandableRow,
} from "@/components/admin/mobile-list-row";

// Admin roster management (M6-S9, superadmin). Add an admin, toggle super /
// blocked, or remove one. The acting admin's own row can't be blocked, demoted,
// or deleted (guarded here and in the action).

const inputCls =
  "w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:py-2 sm:text-sm";

export function AdminsManager({
  admins,
  currentAdminId,
}: {
  admins: AdminListItem[];
  currentAdminId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", isSuperAdmin: false });
  const [err, setErr] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const run = (action: () => Promise<ApiResult<unknown>>, msg: string) =>
    start(async () => {
      const r = await action();
      if (r.ok) {
        toast.success(msg);
        router.refresh();
      } else toast.error(r.error.message || "Something went wrong.");
    });

  const submitAdd = () => {
    setErr({});
    start(async () => {
      const r = await createAdmin(form);
      if (r.ok) {
        toast.success("Admin added.");
        setForm({ name: "", email: "", isSuperAdmin: false });
        setAdding(false);
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not add the admin.");
      }
    });
  };

  const remove = async (a: AdminListItem) => {
    const ok = await confirm({
      title: "Remove admin?",
      message: `Remove ${a.name}'s console access? They keep any student account they may have.`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    run(() => deleteAdmin({ id: a.id }), "Admin removed.");
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover sm:w-auto"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
          Add admin
        </button>
      </div>

      {adding ? (
        <div className="mb-5 rounded-lg bg-surface-2/50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-muted">Name</span>
              <input
                name="adminName"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="Full name"
              />
              {err.name ? (
                <span className="text-xs text-[color:var(--color-danger)]">{err.name}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-muted">Email</span>
              <input
                name="adminEmail"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                type="email"
                className={inputCls}
                placeholder="name@example.com"
              />
              {err.email ? (
                <span className="text-xs text-[color:var(--color-danger)]">{err.email}</span>
              ) : null}
            </label>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={form.isSuperAdmin}
              onChange={() => setForm((f) => ({ ...f, isSuperAdmin: !f.isSuperAdmin }))}
              ariaLabel="Grant super admin"
            />
            <span className="text-sm text-fg-muted">
              Super admin (can manage admins & settings)
            </span>
          </label>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={submitAdd}
              disabled={pending}
              className="min-h-11 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60 sm:w-auto"
            >
              {pending ? "Adding…" : "Save admin"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="min-h-11 w-full rounded-md px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="sm:hidden">
        {admins.map((admin) => {
          const isSelf = admin.id === currentAdminId;
          const active = admin.status === "active";
          return (
            <MobileExpandableRow
              key={admin.id}
              id={`admin-${admin.id}`}
              title={`${admin.name}${isSelf ? " (you)" : ""}`}
              subtitle={admin.email}
              status={
                <span
                  className="text-xs font-medium"
                  style={{ color: active ? "var(--color-success)" : "var(--color-danger)" }}
                >
                  {active ? "Active" : "Blocked"}
                </span>
              }
              expanded={expanded === admin.id}
              onToggle={() => setExpanded((current) => (current === admin.id ? null : admin.id))}
            >
              <MobileDetailGrid>
                <MobileDetail label="Role">
                  {admin.isSuperAdmin ? "Super admin" : "Admin"}
                </MobileDetail>
                <MobileDetail label="Joined">
                  {new Date(admin.createdAt).toLocaleDateString("en-GB")}
                </MobileDetail>
              </MobileDetailGrid>
              <div className="mt-4 flex flex-wrap gap-2 [&>button]:min-h-11">
                <button
                  type="button"
                  disabled={pending || isSelf}
                  onClick={() =>
                    run(
                      () => updateAdmin({ id: admin.id, isSuperAdmin: !admin.isSuperAdmin }),
                      admin.isSuperAdmin ? "Demoted to admin." : "Promoted to super admin.",
                    )
                  }
                  className="rounded-md border border-line px-3 text-sm font-medium text-fg-muted disabled:opacity-40"
                >
                  {admin.isSuperAdmin ? "Make admin" : "Make super"}
                </button>
                <button
                  type="button"
                  disabled={pending || isSelf}
                  onClick={() =>
                    run(
                      () =>
                        updateAdmin({
                          id: admin.id,
                          status: active ? "blocked" : "active",
                        }),
                      active ? "Admin blocked." : "Admin reactivated.",
                    )
                  }
                  className="rounded-md border border-line px-3 text-sm font-medium text-fg-muted disabled:opacity-40"
                >
                  {active ? "Block" : "Activate"}
                </button>
                <button
                  type="button"
                  disabled={pending || isSelf}
                  onClick={() => remove(admin)}
                  className="rounded-md px-3 text-sm font-medium text-[color:var(--color-danger)] disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </MobileExpandableRow>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-subtle">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const isSelf = a.id === currentAdminId;
              const activeStatus = a.status === "active";
              return (
                <tr key={a.id} className="border-b border-hairline">
                  <td className="py-3 pr-4 font-medium text-fg">
                    {a.name}
                    {isSelf ? <span className="ml-1.5 text-xs text-fg-subtle">(you)</span> : null}
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">{a.email}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        a.isSuperAdmin ? "bg-accent/12 text-accent" : "bg-surface-2 text-fg-muted"
                      }`}
                    >
                      {a.isSuperAdmin ? "Super admin" : "Admin"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        color: activeStatus ? "var(--color-success)" : "var(--color-danger)",
                        background: activeStatus
                          ? "color-mix(in oklab, var(--color-success) 12%, transparent)"
                          : "color-mix(in oklab, var(--color-danger) 12%, transparent)",
                      }}
                    >
                      {activeStatus ? "Active" : "Blocked"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={pending || isSelf}
                        onClick={() =>
                          run(
                            () => updateAdmin({ id: a.id, isSuperAdmin: !a.isSuperAdmin }),
                            a.isSuperAdmin ? "Demoted to admin." : "Promoted to super admin.",
                          )
                        }
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                      >
                        {a.isSuperAdmin ? "Make admin" : "Make super"}
                      </button>
                      <button
                        type="button"
                        disabled={pending || isSelf}
                        onClick={() =>
                          run(
                            () =>
                              updateAdmin({
                                id: a.id,
                                status: activeStatus ? "blocked" : "active",
                              }),
                            activeStatus ? "Admin blocked." : "Admin reactivated.",
                          )
                        }
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                      >
                        {activeStatus ? "Block" : "Activate"}
                      </button>
                      <button
                        type="button"
                        disabled={pending || isSelf}
                        onClick={() => remove(a)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-[color:var(--color-danger)] disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
