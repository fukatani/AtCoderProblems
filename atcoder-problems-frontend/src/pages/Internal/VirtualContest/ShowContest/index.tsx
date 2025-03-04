import React, { useState } from "react";
import { NavLink, useHistory } from "react-router-dom";
import {
  Alert,
  Button,
  ButtonGroup,
  Col,
  Row,
  Spinner,
  Table,
  Badge,
  Form,
  FormGroup,
  CustomInput,
  Collapse,
} from "reactstrap";
import { GoChevronDown, GoChevronUp } from "react-icons/go";
import { useMergedProblemMap } from "../../../../api/APIClient";
import {
  useLoginState,
  useVirtualContest,
} from "../../../../api/InternalAPIClient";
import {
  formatMomentDateTimeDay,
  getCurrentUnixtimeInSecond,
  parseSecond,
} from "../../../../utils/DateUtil";
import { formatMode, formatPublicState, VirtualContestItem } from "../../types";
import { TweetButton } from "../../../../components/TweetButton";
import { useLoginLink } from "../../../../utils/Url";
import { Timer } from "../../../../components/Timer";
import { ACCOUNT_INFO } from "../../../../utils/RouterPath";
import { useLocalStorage } from "../../../../utils/LocalStorage";
import { ProblemLink } from "../../../../components/ProblemLink";
import { joinContest, leaveContest } from "../ApiClient";
import { ContestTable } from "./ContestTable";
import { LockoutContestTable } from "./LockoutContestTable";
import { TrainingContestTable } from "./TrainingContestTable";
import { compareProblem } from "./util";

interface Props {
  contestId: string;
}

export const ShowContest = (props: Props) => {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const loginState = useLoginState();
  const [showRating, setShowRating] = useLocalStorage("showRating", false);
  const [pinMe, setPinMe] = useLocalStorage("pinMe", false);
  const [showProblemTable, setShowProblemTable] = useState(true);
  const history = useHistory();
  const virtualContestResponse = useVirtualContest(props.contestId);
  const { data: problemMap } = useMergedProblemMap();
  const loginLink = useLoginLink();

  if (!virtualContestResponse.data && !virtualContestResponse.error) {
    return <Spinner style={{ width: "3rem", height: "3rem" }} />;
  } else if (!virtualContestResponse.data) {
    return <Alert color="danger">Failed to fetch contest info.</Alert>;
  }

  const {
    info: contestInfo,
    participants: contestParticipants,
    problems: contestProblems,
  } = virtualContestResponse.data;
  const rawAtCoderUserId = loginState.data?.atcoder_user_id;
  const internalUserId = loginState?.data?.internal_user_id;

  const atCoderUserId = rawAtCoderUserId ? rawAtCoderUserId : "";
  const isLoggedIn = internalUserId !== undefined;
  const userIdIsSet = atCoderUserId !== "";

  const start = contestInfo.start_epoch_second;
  const end = contestInfo.start_epoch_second + contestInfo.duration_second;
  const penaltySecond = contestInfo.penalty_second;
  const alreadyJoined =
    userIdIsSet && contestParticipants.includes(atCoderUserId);
  const now = getCurrentUnixtimeInSecond();
  const canJoin = !alreadyJoined && userIdIsSet && now < end;
  const canLeave = alreadyJoined && userIdIsSet && now < start;
  const isOwner = contestInfo.owner_user_id === internalUserId;
  const enableEstimatedPerformances = contestProblems.length < 10;

  const showProblems = start < now;
  const problems = contestProblems.map((item): {
    item: VirtualContestItem;
    contestId?: string;
    title?: string;
  } => {
    const problem = problemMap?.get(item.id);
    if (problem) {
      return {
        item,
        contestId: problem.contest_id,
        title: problem.title,
      };
    } else {
      return { item };
    }
  });

  const sortedItems = problems
    .map((p) => ({
      contestId: p.contestId,
      title: p.title,
      ...p.item,
    }))
    .sort(compareProblem);

  return (
    <>
      <Row className="mb-2">
        <Col md="auto">
          <h1>{contestInfo.title}</h1>
        </Col>
        <Col md="auto" className="align-items-center d-flex">
          <Badge color={contestInfo.is_public ? "success" : "danger"}>
            {formatPublicState(contestInfo.is_public)}
          </Badge>
          <Badge>Mode: {formatMode(contestInfo.mode)}</Badge>
        </Col>
      </Row>
      <Row>
        <Col>
          <h4>{contestInfo.memo}</h4>
        </Col>
      </Row>
      <Row className="my-2">
        <Col lg="6" md="12">
          <Table className="mb-0">
            <tbody>
              <tr>
                <th>Time</th>
                <td>
                  {formatMomentDateTimeDay(parseSecond(start))} -{" "}
                  {formatMomentDateTimeDay(parseSecond(end))}
                </td>
              </tr>
              <tr>
                <th>Penalty</th>
                <td>{penaltySecond} seconds for each wrong submission</td>
              </tr>
            </tbody>
          </Table>
        </Col>
        <Col lg="6" md="12">
          <Table className="mb-0">
            <tbody>
              {now < start ? (
                <tr>
                  <th>Begin in</th>
                  <td>
                    <Timer end={start} />
                  </td>
                </tr>
              ) : now < end ? (
                <tr>
                  <th>Remaining</th>
                  <td>
                    <Timer end={end} />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Col>
      </Row>

      <Row className="my-2">
        <Col sm="12">
          {!isLoggedIn ? (
            <Alert color="warning">
              Please <a href={loginLink}>Login</a> before you join the contest.
            </Alert>
          ) : !userIdIsSet ? (
            <Alert color="warning">
              Please set the AtCoder ID from{" "}
              <NavLink to={ACCOUNT_INFO}>here</NavLink>, before you join the
              contest.
            </Alert>
          ) : null}
          <ButtonGroup>
            {canJoin ? (
              <Button
                onClick={async () => {
                  await joinContest(props.contestId);
                  await virtualContestResponse.revalidate();
                }}
              >
                Join
              </Button>
            ) : null}
            {canLeave ? (
              <Button
                onClick={async () => {
                  await leaveContest(props.contestId);
                  await virtualContestResponse.revalidate();
                }}
              >
                Leave
              </Button>
            ) : null}
            {isOwner ? (
              <Button
                onClick={(): void =>
                  history.push({
                    pathname: `/contest/update/${contestInfo.id}`,
                  })
                }
              >
                Edit
              </Button>
            ) : null}
            <TweetButton
              id={contestInfo.id}
              text={contestInfo.title}
              color="primary"
            >
              Tweet
            </TweetButton>
          </ButtonGroup>
        </Col>
      </Row>

      {showProblems && formatMode(contestInfo.mode) === "Normal" && (
        <div className="my-2">
          <Row>
            <Col>
              <div
                style={{
                  display: "flex",
                  flexFlow: "row wrap",
                  alignItems: "center",
                }}
              >
                <h3>Problems</h3>
                <Button
                  color="secondary"
                  size="sm"
                  onClick={() => setShowProblemTable(!showProblemTable)}
                  className="mx-3"
                >
                  {showProblemTable ? <GoChevronUp /> : <GoChevronDown />}
                </Button>
              </div>
            </Col>
          </Row>
          <Row>
            <Col>
              <Collapse isOpen={showProblemTable}>
                <Table striped size="sm">
                  <thead>
                    <tr>
                      <th> </th>
                      <th>Problem Name</th>
                      <th className="text-center">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((p, i) => (
                      <tr key={i}>
                        <th className="text-center">
                          {p.contestId && p.title ? (
                            <ProblemLink
                              problemId={p.id}
                              contestId={p.contestId}
                              problemTitle={`${i + 1}`}
                            />
                          ) : (
                            i + 1
                          )}
                        </th>
                        <td>
                          {p.contestId && p.title ? (
                            <ProblemLink
                              problemId={p.id}
                              contestId={p.contestId}
                              problemTitle={p.title}
                            />
                          ) : (
                            p.id
                          )}
                        </td>
                        <td className="text-center">
                          {p.point !== null && p.point}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Collapse>
            </Col>
          </Row>
        </div>
      )}

      <div className="my-2">
        <Row>
          <Col>
            <Form inline>
              <h3>Standings</h3>
              <FormGroup inline className="ml-3">
                <CustomInput
                  type="switch"
                  id="autoRefresh"
                  label="Auto Refresh"
                  inline
                  checked={autoRefresh}
                  onChange={(): void => setAutoRefresh(!autoRefresh)}
                />
                <CustomInput
                  type="switch"
                  id="showRating"
                  label="Show Rating"
                  inline
                  checked={showRating}
                  onChange={(): void => setShowRating(!showRating)}
                />
                {alreadyJoined && (
                  <CustomInput
                    type="switch"
                    id="pinMe"
                    label="Pin me"
                    inline
                    checked={pinMe}
                    onChange={(): void => setPinMe(!pinMe)}
                  />
                )}
              </FormGroup>
            </Form>
          </Col>
        </Row>
        <Row>
          <Col sm="12">
            {contestInfo.mode === "lockout" ? (
              <LockoutContestTable
                showRating={showRating}
                showProblems={showProblems}
                problems={problems}
                participants={contestParticipants}
                enableAutoRefresh={autoRefresh}
                start={start}
                end={end}
              />
            ) : contestInfo.mode === "training" ? (
              <TrainingContestTable
                showRating={showRating}
                showProblems={showProblems}
                problems={problems}
                users={contestParticipants}
                start={start}
                end={end}
                enableAutoRefresh={autoRefresh}
              />
            ) : (
              <ContestTable
                contestId={contestInfo.id}
                contestTitle={contestInfo.title}
                showRating={showRating}
                showProblems={showProblems}
                problems={problems}
                users={contestParticipants}
                enableEstimatedPerformances={enableEstimatedPerformances}
                start={start}
                end={end}
                enableAutoRefresh={autoRefresh}
                atCoderUserId={atCoderUserId}
                pinMe={pinMe}
                penaltySecond={penaltySecond}
              />
            )}
          </Col>
        </Row>
      </div>
    </>
  );
};
