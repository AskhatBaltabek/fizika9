-- 2026-11-19: контекстік тапсырмалар (бөліктер + критерийлер) және сабақ мақсаты
alter table tasks add column parts text not null default '[]';
alter table tasks add column rubric text not null default '[]';
alter table topics add column goal text not null default '';
