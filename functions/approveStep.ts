import { approveStepHandler } from './_shared/actions/approveStep';

export default async (req: any, res: any) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const result = await approveStepHandler(req.body);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'An error occurred' });
  }
};
