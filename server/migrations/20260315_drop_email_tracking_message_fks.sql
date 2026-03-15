ALTER TABLE email_opens
  DROP CONSTRAINT IF EXISTS email_opens_message_id_deal_messages_id_fk;

ALTER TABLE email_link_clicks
  DROP CONSTRAINT IF EXISTS email_link_clicks_message_id_deal_messages_id_fk;
