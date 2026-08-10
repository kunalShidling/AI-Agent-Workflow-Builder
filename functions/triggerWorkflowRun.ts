import { triggerWorkflowRunHandler } from './_shared/actions/triggerWorkflowRun';

export default async (req: any, res: any) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const result = await triggerWorkflowRunHandler(req.body);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'An error occurred' });
  }
};
