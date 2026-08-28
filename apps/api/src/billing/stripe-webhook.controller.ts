import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';

@Controller('billing/webhooks')
export class StripeWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const event = this.billingService.constructStripeEvent(
      request.rawBody,
      signature,
    );
    return this.billingService.processStripeEvent(event);
  }
}
