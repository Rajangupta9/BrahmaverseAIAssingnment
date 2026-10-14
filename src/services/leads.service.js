import prisma from '../prisma/client.js';
import { AppError } from '../utils/errors.js';

export const PUBLIC_LEAD_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  courseInterest: true,
  source: true,
  notes: true,
  createdAt: true,
};

export const FULL_LEAD_FIELDS = {
  ...PUBLIC_LEAD_FIELDS,
  status: true,
  counselorId: true,
};

async function submitLead({ name, email, phone, courseInterest, notes }) {
  return prisma.lead.create({
    data: {
      name,
      email,
      phone: phone ?? null,
      courseInterest,
      notes: notes ?? null,
      source: 'online',
      status: 'unclaimed',
    },
    select: { id: true },
  });
}

async function getUnclaimed() {
  return prisma.lead.findMany({
    where: { status: 'unclaimed' },
    select: PUBLIC_LEAD_FIELDS,
    orderBy: { createdAt: 'asc' },
  });
}

async function claim(leadId, userId) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new AppError('Lead not found.', 404);
  if (lead.status === 'claimed') throw new AppError('Lead is already claimed.', 409);

  return prisma.lead.update({
    where: { id: leadId },
    data: { status: 'claimed', counselorId: userId },
    select: FULL_LEAD_FIELDS,
  });
}

async function getMy(userId) {
  return prisma.lead.findMany({
    where: { counselorId: userId },
    select: FULL_LEAD_FIELDS,
    orderBy: { createdAt: 'desc' },
  });
}

async function createLead({ name, email, phone, courseInterest, notes }, userId) {
  return prisma.lead.create({
    data: {
      name,
      email,
      phone: phone ?? null,
      courseInterest,
      notes: notes ?? null,
      source: 'counselor',
      status: 'claimed',
      counselorId: userId,
    },
    select: FULL_LEAD_FIELDS,
  });
}

async function getAll() {
  return prisma.lead.findMany({
    select: FULL_LEAD_FIELDS,
    orderBy: { createdAt: 'desc' },
  });
}

async function reassign(leadId, targetCounselorId) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new AppError('Lead not found.', 404);

  const counselor = await prisma.user.findUnique({ where: { id: targetCounselorId } });
  if (!counselor) throw new AppError('Counselor not found.', 404);

  return prisma.lead.update({
    where: { id: leadId },
    data: { counselorId: targetCounselorId, status: 'claimed' },
    select: FULL_LEAD_FIELDS,
  });
}

export const leadsService = {
  submitLead,
  getUnclaimed,
  claim,
  getMy,
  createLead,
  getAll,
  reassign,
};
