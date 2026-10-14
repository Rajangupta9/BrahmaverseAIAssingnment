import { leadsService } from '../services/leads.service.js';

async function submit(req, res, next) {
  try {
    const result = await leadsService.submitLead(req.body);
    return res.status(201).json({
      message: 'Lead submitted successfully.',
      id: result.id,
    });
  } catch (err) {
    next(err);
  }
}

async function getUnclaimed(req, res, next) {
  try {
    const leads = await leadsService.getUnclaimed();
    return res.status(200).json(leads);
  } catch (err) {
    next(err);
  }
}

async function claim(req, res, next) {
  try {
    const lead = await leadsService.claim(req.params.id, req.user.id);
    return res.status(200).json(lead);
  } catch (err) {
    next(err);
  }
}

async function getMy(req, res, next) {
  try {
    const leads = await leadsService.getMy(req.user.id);
    return res.status(200).json(leads);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const lead = await leadsService.createLead(req.body, req.user.id);
    return res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
}

async function getAll(req, res, next) {
  try {
    const leads = await leadsService.getAll();
    return res.status(200).json(leads);
  } catch (err) {
    next(err);
  }
}

async function reassign(req, res, next) {
  try {
    const lead = await leadsService.reassign(req.params.id, req.body.counselorId);
    return res.status(200).json(lead);
  } catch (err) {
    next(err);
  }
}

export const leadsController = {
  submit,
  getUnclaimed,
  claim,
  getMy,
  create,
  getAll,
  reassign,
};
