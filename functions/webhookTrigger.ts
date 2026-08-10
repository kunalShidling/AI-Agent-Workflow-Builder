import { webhookTriggerHandler } from './_shared/actions/webhookTrigger';

export default async (req: any, res: any) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const secret = req.headers['authorization'];
    
    const actionReq = {
      input: req.body.input,
      secret: secret as string
    };
    
    const result = await webhookTriggerHandler(actionReq);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'An error occurred' });
  }
};
