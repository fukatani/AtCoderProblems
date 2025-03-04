use crate::models::Submission;
use crate::PgPool;
use anyhow::Result;
use async_trait::async_trait;

const SUBMISSION_LIMIT: i64 = 10000;

pub enum SubmissionRequest<'a> {
    UserAll {
        user_id: &'a str,
    },
    UsersAccepted {
        user_ids: &'a [&'a str],
    },
    FromTime {
        from_second: i64,
        count: i64,
    },
    FromUserAndTime {
        user_id: &'a str,
        from_second: i64,
        count: usize,
    },
    RecentAccepted {
        count: i64,
    },
    RecentAll {
        count: i64,
    },
    InvalidResult {
        from_second: i64,
    },
    AllAccepted,
    ByIds {
        ids: &'a [i64],
    },
    UsersProblemsTime {
        user_ids: &'a [&'a str],
        problem_ids: &'a [&'a str],
        from_second: i64,
        to_second: i64,
    },
}

#[async_trait]
pub trait SubmissionClient {
    async fn get_submissions<'a>(&self, request: SubmissionRequest<'a>) -> Result<Vec<Submission>>;
    async fn update_submissions(&self, values: &[Submission]) -> Result<usize>;
    async fn count_stored_submissions(&self, ids: &[i64]) -> Result<usize> {
        let submissions = self
            .get_submissions(SubmissionRequest::ByIds { ids })
            .await?;
        Ok(submissions.len())
    }
}

#[async_trait]
impl SubmissionClient for PgPool {
    async fn get_submissions<'a>(&self, request: SubmissionRequest<'a>) -> Result<Vec<Submission>> {
        let submissions = match request {
            SubmissionRequest::UserAll { user_id } => sqlx::query_as(
                r"
                    SELECT * FROM submissions
                    WHERE LOWER(user_id) = LOWER($1)
                    ",
            )
            .bind(user_id)
            .fetch_all(self),
            SubmissionRequest::FromTime { from_second, count } => sqlx::query_as(
                r"
                         SELECT * FROM submissions
                         WHERE epoch_second >= $1
                         ORDER BY epoch_second ASC
                         LIMIT $2
                         ",
            )
            .bind(from_second)
            .bind(count)
            .fetch_all(self),
            SubmissionRequest::FromUserAndTime {
                user_id,
                from_second,
                count,
            } => sqlx::query_as(
                r"
                         SELECT * FROM submissions
                         WHERE LOWER(user_id) = LOWER($1)
                         AND epoch_second >= $2
                         ORDER BY epoch_second ASC
                         LIMIT $3
                         ",
            )
            .bind(user_id)
            .bind(from_second)
            .bind(count as i64)
            .fetch_all(self),
            SubmissionRequest::RecentAccepted { count } => sqlx::query_as(
                r"
                    SELECT * FROM submissions
                    WHERE result = 'AC'
                    ORDER BY id DESC
                    LIMIT $1
                    ",
            )
            .bind(count)
            .fetch_all(self),
            SubmissionRequest::RecentAll { count } => sqlx::query_as(
                r"
                    SELECT * FROM submissions
                    ORDER BY id DESC
                    LIMIT $1
                    ",
            )
            .bind(count)
            .fetch_all(self),
            SubmissionRequest::UsersAccepted { user_ids } => sqlx::query_as(
                r"
                    SELECT * FROM submissions
                    WHERE result = 'AC'
                    AND user_id = ANY($1)
                    ",
            )
            .bind(user_ids)
            .fetch_all(self),
            SubmissionRequest::AllAccepted => sqlx::query_as(
                r"
                    SELECT * FROM submissions
                    WHERE result = 'AC'
                    ",
            )
            .fetch_all(self),
            SubmissionRequest::InvalidResult { from_second } => sqlx::query_as(
                r"
                    SELECT * FROM submissions
                    WHERE 
                        result != ALL(
                            ARRAY['AC', 'WA', 'TLE', 'CE', 'RE', 'MLE', 'OLE', 'QLE', 'IE', 'NG']
                        )
                    AND 
                        epoch_second >= $1
                    ORDER BY id DESC
                    ",
            )
            .bind(from_second)
            .fetch_all(self),
            SubmissionRequest::ByIds { ids } => sqlx::query_as(
                r"
                    SELECT * FROM submissions
                    WHERE id = ANY($1)
                    ",
            )
            .bind(ids)
            .fetch_all(self),
            SubmissionRequest::UsersProblemsTime {
                user_ids,
                problem_ids,
                from_second,
                to_second,
            } => sqlx::query_as(
                r"
                    SELECT * FROM submissions
                    WHERE user_id = ANY($1)
                    AND problem_id = ANY($2)
                    AND epoch_second >= $3
                    AND epoch_second <= $4
                    LIMIT $5
                    ",
            )
            .bind(user_ids)
            .bind(problem_ids)
            .bind(from_second)
            .bind(to_second)
            .bind(SUBMISSION_LIMIT)
            .fetch_all(self),
        }
        .await?;
        Ok(submissions)
    }

    async fn update_submissions(&self, values: &[Submission]) -> Result<usize> {
        let (
            ids,
            epoch_seconds,
            problem_ids,
            contest_ids,
            user_ids,
            languages,
            points,
            lengths,
            results,
            execution_times,
        ) = values.iter().fold(
            (
                vec![],
                vec![],
                vec![],
                vec![],
                vec![],
                vec![],
                vec![],
                vec![],
                vec![],
                vec![],
            ),
            |(
                mut ids,
                mut epoch_seconds,
                mut problem_ids,
                mut contest_ids,
                mut user_ids,
                mut languages,
                mut points,
                mut lengths,
                mut results,
                mut execution_times,
            ),
             cur| {
                ids.push(cur.id);
                epoch_seconds.push(cur.epoch_second);
                problem_ids.push(cur.problem_id.as_str());
                contest_ids.push(cur.contest_id.as_str());
                user_ids.push(cur.user_id.as_str());
                languages.push(cur.language.as_str());
                points.push(cur.point);
                lengths.push(cur.length);
                results.push(cur.result.as_str());
                execution_times.push(cur.execution_time);

                (
                    ids,
                    epoch_seconds,
                    problem_ids,
                    contest_ids,
                    user_ids,
                    languages,
                    points,
                    lengths,
                    results,
                    execution_times,
                )
            },
        );
        let count = sqlx::query(
            r"
            INSERT INTO submissions
            (
                id,
                epoch_second,
                problem_id,
                contest_id,
                user_id,
                language,
                point,
                length,
                result,
                execution_time
            )
            VALUES (
                UNNEST($1::BIGINT[]),
                UNNEST($2::BIGINT[]),
                UNNEST($3::VARCHAR(255)[]),
                UNNEST($4::VARCHAR(255)[]),
                UNNEST($5::VARCHAR(255)[]),
                UNNEST($6::VARCHAR(255)[]),
                UNNEST($7::FLOAT8[]),
                UNNEST($8::INTEGER[]),
                UNNEST($9::VARCHAR(255)[]),
                UNNEST($10::INTEGER[])
            )
            ON CONFLICT (id)
            DO UPDATE SET
                user_id = EXCLUDED.user_id,
                result = EXCLUDED.result,
                point = EXCLUDED.point,
                execution_time = EXCLUDED.execution_time
            ",
        )
        .bind(ids)
        .bind(epoch_seconds)
        .bind(problem_ids)
        .bind(contest_ids)
        .bind(user_ids)
        .bind(languages)
        .bind(points)
        .bind(lengths)
        .bind(results)
        .bind(execution_times)
        .execute(self)
        .await?;
        Ok(count.rows_affected() as usize)
    }
}
