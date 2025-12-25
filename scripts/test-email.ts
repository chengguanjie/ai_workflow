
import { sendEmail } from '@/lib/email'

async function main() {
                  console.log('Testing email sending...')
                  const result = await sendEmail({
                                    to: 'test@example.com',
                                    subject: 'Test Email',
                                    html: '<p>This is a test.</p>',
                                    text: 'This is a test.',
                  })
                  console.log('Result:', result)
}

main().catch(console.error)
