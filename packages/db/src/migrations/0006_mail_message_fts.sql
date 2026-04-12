CREATE VIRTUAL TABLE mail_message_fts USING fts5(
  message_id UNINDEXED,
  subject,
  snippet,
  body_text,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO mail_message_fts (message_id, subject, snippet, body_text)
SELECT id, subject, snippet, body_text FROM mail_message;

CREATE TRIGGER mail_message_ai AFTER INSERT ON mail_message BEGIN
  INSERT INTO mail_message_fts (message_id, subject, snippet, body_text)
  VALUES (new.id, new.subject, new.snippet, new.body_text);
END;

CREATE TRIGGER mail_message_au AFTER UPDATE ON mail_message BEGIN
  DELETE FROM mail_message_fts WHERE message_id = old.id;
  INSERT INTO mail_message_fts (message_id, subject, snippet, body_text)
  VALUES (new.id, new.subject, new.snippet, new.body_text);
END;

CREATE TRIGGER mail_message_ad AFTER DELETE ON mail_message BEGIN
  DELETE FROM mail_message_fts WHERE message_id = old.id;
END;
