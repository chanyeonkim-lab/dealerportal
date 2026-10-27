import { NextResponse } from 'next/server';
import { opportunities } from '@/lib/domain';
import { listContracts } from '@/lib/db';
export async function GET(){return NextResponse.json({opportunities,contracts:listContracts(),liveAI:Boolean(process.env.OPENAI_API_KEY||process.env.DEALER_OPENAI_API_KEY)});}
