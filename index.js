import arlo from './arlo/arlo.mjs'
import * as dotenv from 'dotenv'
dotenv.config()

const Arlo = new arlo(
  process.env.ARLO_USER,
  process.env.ARLO_PWD,
  process.env.IMAP_USER,
  process.env.IMAP_PWD,
  process.env.IMAP_HOST
);

//Arlo.subscribe();
Arlo.getDevices();         