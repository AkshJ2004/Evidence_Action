
const { roles, visitStatus } = require('../config');

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

function validateTransition(action, visit, user, remarks) {
  const transition = LEGAL_TRANSITIONS[action];

  if (!transition) {
    return {
      allowed: false,
      statusCode: 400,
      error: `Illegal action '${action}'. Permitted actions are: ${Object.keys(LEGAL_TRANSITIONS).join(', ')}`,
    };
  }

  if (visit.status === visitStatus.COMPLETED) {
    return {
      allowed: false,
      statusCode: 400,
      error: 'COMPLETED is a terminal state. No transitions are permitted from COMPLETED.',
    };
  }

  if (!transition.validSourceStates.includes(visit.status)) {
    return {
      allowed: false,
      statusCode: 400,
      error: `Cannot ${action.toLowerCase()} a visit with status '${visit.status}'. Valid status must be: ${transition.validSourceStates.join(' or ')}.`,
    };
  }

  const isCreator = visit.officer_id === user.id;
  const isApproverRole = user.role === roles.HQ_APPROVER || user.role === roles.ADMIN;

  switch (action) {
    case 'SUBMIT':
      
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
      
      if (!isApproverRole) {
        return {
          allowed: false,
          statusCode: 403,
          error: 'Only an HQ Approver or Admin may decide on visits.',
        };
      }
      
      if (isCreator) {
        return {
          allowed: false,
          statusCode: 403,
          error: 'Separation of duties violation: An approver cannot approve or reject a visit they created.',
        };
      }
      
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
