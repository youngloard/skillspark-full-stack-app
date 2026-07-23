import "server-only";
import type { Admin } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { normalizeEmail } from "@/lib/identity";

// Admin account management (M6-S9, superadmin-only). The console's own operators
// — separate from Students. Two invariants protect against lock-out: the last
// active super admin can't be demoted, blocked, or deleted (checked here), and
// a super admin can't act on their own account (checked in the action, which
// knows who is acting).

export type AdminListItem = {
  id: string;
  name: string;
  email: string;
  status: string;
  isSuperAdmin: boolean;
  createdAt: string;
};

export async function listAdmins(): Promise<AdminListItem[]> {
  const rows = await db.admin.findMany({
    orderBy: [{ isSuperAdmin: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      isSuperAdmin: true,
      createdAt: true,
    },
  });
  return rows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }));
}

export type AdminCreateData = { name: string; email: string; isSuperAdmin: boolean };

export async function createAdmin(data: AdminCreateData): Promise<Admin> {
  const email = normalizeEmail(data.email);
  try {
    return await db.admin.create({
      data: { name: data.name, email, isSuperAdmin: data.isSuperAdmin },
    });
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError("CONFLICT", "An admin with this email already exists", {
        email: "Already in use",
      });
    }
    throw cause;
  }
}

export type AdminUpdateData = {
  name?: string;
  status?: "active" | "blocked";
  isSuperAdmin?: boolean;
};

/** Would this change leave zero active super admins? */
async function wouldStrandSuperAdmins(before: Admin, data: AdminUpdateData): Promise<boolean> {
  const staysSuper = data.isSuperAdmin ?? before.isSuperAdmin;
  const staysActive = (data.status ?? before.status) === "active";
  if (staysSuper && staysActive) return false; // still an active super admin
  if (!(before.isSuperAdmin && before.status === "active")) return false; // wasn't one
  const activeSupers = await db.admin.count({
    where: { isSuperAdmin: true, status: "active" },
  });
  return activeSupers <= 1;
}

export async function updateAdmin(
  id: string,
  data: AdminUpdateData,
): Promise<{ before: Admin; after: Admin }> {
  const before = await db.admin.findUnique({ where: { id } });
  if (!before) throw new DomainError("NOT_FOUND", "Admin not found");

  if (await wouldStrandSuperAdmins(before, data)) {
    throw new DomainError(
      "VALIDATION",
      "This is the last active super admin — promote another admin first",
    );
  }

  const after = await db.admin.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.isSuperAdmin !== undefined && { isSuperAdmin: data.isSuperAdmin }),
    },
  });
  return { before, after };
}

export async function deleteAdmin(id: string): Promise<Admin> {
  const admin = await db.admin.findUnique({ where: { id } });
  if (!admin) throw new DomainError("NOT_FOUND", "Admin not found");
  if (admin.isSuperAdmin && admin.status === "active") {
    const activeSupers = await db.admin.count({
      where: { isSuperAdmin: true, status: "active" },
    });
    if (activeSupers <= 1) {
      throw new DomainError(
        "VALIDATION",
        "This is the last active super admin — promote another admin first",
      );
    }
  }
  try {
    return await db.admin.delete({ where: { id } });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2025") {
      throw new DomainError("NOT_FOUND", "Admin not found");
    }
    throw cause;
  }
}
