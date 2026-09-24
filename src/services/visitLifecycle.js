/**
 * Visit Lifecycle & State Machine Service
 * 
 * Enforces the strict transition rules defined in Section 2.3 of the specification:
 * 
 * | From      | Action   | To        | Who may do it                     |
 * |-----------|----------|-----------|-----------------------------------|
 * | DRAFT     | Submit   | PENDING   | The officer who created the visit |
 * | PENDING   | Approve  | APPROVED  | An approver — never the creator   |
 * | PENDING   | Reject   | REJECTED  | An approver — never the creator   |
 * | REJECTED  | Resubmit | PENDING   | The officer who created the visit |
 * | APPROVED  | Complete | COMPLETED | The officer who created the visit |
 * | COMPLETED | —        | (terminal)| Nothing follows COMPLETED         |
 * 
 * Any request for a transition not in this list must be refused.
 * A rejection must carry a written remark; an approval may.
 */

const { roles, visitStatus } = require('../config');

// Define the authoritative state transition map
const LEGAL_TRANSITIONS = {
  SUBMIT: {
    validSourceStates: [visitStatus.DRAFT, visitStatus.REJECTED],
    targetState: visitStatus.PENDING,
    description: 'Submit/Resubmit a visit for approval',
  },
  APPROVE: {
    validSourceStates: [visitStatus.PENDING],
    targetState: visitStatus.APPROVED,
    description: 'Approve a pending visit',
  },
  REJECT: {
    validSourceStates: [visitStatus.PENDING],
    targetState: visitStatus.REJECTED,
    description: 'Reject a pending visit with required remarks',
  },
  COMPLETE: {
    validSourceStates: [visitStatus.APPROVED],
    targetState: visitStatus.COMPLETED,
    description: 'Mark an approved visit as completed',
  },
};

/**
 * Validates whether a state transition is legal for the given visit, user, and action.
 * 
 * @param {string} action - One of: 'SUBMIT', 'APPROVE', 'REJECT', 'COMPLETE'
 * @param {object} visit - Existing visit record from database
 * @param {object} user - Authenticated user making the request (id, role, etc.)
 * @param {string} [remarks] - Written remarks for approval or rejection
 * @returns {{ allowed: boolean, nextStatus?: string, error?: string, statusCode?: number }}
 */
function validateTransition(action, visit, user, remarks) {
  const transition = LEGAL_TRANSITIONS[action];

  if (!transition) {
    return {
      allowed: false,
      statusCode: 400,
      error: `Illegal action '${action}'. Permitted actions are: ${Object.keys(LEGAL_TRANSITIONS).join(', ')}`,
    };
  }

  // Check 1: Terminal state check
  if (visit.status === visitStatus.COMPLETED) {
    return {
      allowed: false,
      statusCode: 400,
      error: 'COMPLETED is a terminal state. No transitions are permitted from COMPLETED.',
    };
  }

  // Check 2: Legal source status check
  if (!transition.validSourceStates.includes(visit.status)) {
    return {
      allowed: false,
      statusCode: 400,
      error: `Cannot ${action.toLowerCase()} a visit with status '${visit.status}'. Valid status must be: ${transition.validSourceStates.join(' or ')}.`,
    };
  }

  // Check 3: Actor authorization and separation of duties
  const isCreator = visit.officer_id === user.id;
  const isApproverRole = user.role === roles.HQ_APPROVER || user.role === roles.ADMIN;

  switch (action) {
    case 'SUBMIT':
      // DRAFT -> PENDING or REJECTED -> PENDING: Must be the officer who created the visit
      if (!isCreator && user.role !== roles.ADMIN) {
        return {
          allowed: false,
          statusCode: 403,
          error: 'Only the officer who created the visit may submit or resubmit it.',
        };
      }
      break;

    case 'APPROVE':
    case 'REJECT':
      // PENDING -> APPROVED / REJECTED:
      // Must be an approver or admin
      if (!isApproverRole) {
        return {
          allowed: false,
          statusCode: 403,
          error: 'Only an HQ Approver or Admin may decide on visits.',
        };
      }
      // Strict rule: "An approver — never the creator"
      if (isCreator) {
        return {
          allowed: false,
          statusCode: 403,
          error: 'Separation of duties violation: An approver cannot approve or reject a visit they created.',
        };
      }
      // A rejection must carry a written remark
      if (action === 'REJECT') {
        if (!remarks || typeof remarks !== 'string' || remarks.trim().length === 0) {
          return {
            allowed: false,
            statusCode: 400,
            error: 'A rejection must carry a non-empty written remark explaining the decision.',
          };
        }
      }
      break;

    case 'COMPLETE':
      // APPROVED -> COMPLETED: Must be the officer who created the visit
      if (!isCreator && user.role !== roles.ADMIN) {
        return {
          allowed: false,
          statusCode: 403,
          error: 'Only the officer who created the visit may mark it as completed.',
        };
      }
      break;
  }

  return {
    allowed: true,
    nextStatus: transition.targetState,
  };
}

/**
 * Validates whether a visit can be edited.
 * Specification: "Edits a visit. Only permitted while the visit is still editable."
 * Visits are editable only while in DRAFT or REJECTED state, and only by their creator.
 */
function validateEditable(visit, user) {
  const isCreator = visit.officer_id === user.id;

  if (!isCreator && user.role !== roles.ADMIN) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Only the officer who created this visit can edit it.',
    };
  }

  const editableStates = [visitStatus.DRAFT, visitStatus.REJECTED];
  if (!editableStates.includes(visit.status)) {
    return {
      allowed: false,
      statusCode: 400,
      error: `Visit cannot be edited in '${visit.status}' status. Editing is only permitted in DRAFT or REJECTED status before resubmission.`,
    };
  }

  return { allowed: true };
}

module.exports = {
  LEGAL_TRANSITIONS,
  validateTransition,
  validateEditable,
};
