import { Row } from "reactstrap";
import React from "react";
import { BootstrapTable, TableHeaderColumn } from "react-bootstrap-table";
import { useProblemModelMap } from "../../api/APIClient";
import Contest from "../../interfaces/Contest";
import Problem from "../../interfaces/Problem";
import {
  noneStatus,
  ProblemId,
  ProblemStatus,
  StatusLabel,
} from "../../interfaces/Status";
import {
  ColorMode,
  TableColor,
  statusToTableColor,
  combineTableColorList,
} from "../../utils/TableColor";
import { ProblemLink } from "../../components/ProblemLink";
import { ContestLink } from "../../components/ContestLink";
import ProblemModel from "../../interfaces/ProblemModel";
import { SubmitTimespan } from "../../components/SubmitTimespan";
import { RatingInfo } from "../../utils/RatingInfo";

interface Props {
  contests: Contest[];
  contestToProblems: Map<string, Problem[]>;
  hideCompletedContest: boolean;
  showDifficulty: boolean;
  colorMode: ColorMode;
  title: string;
  statusLabelMap: Map<ProblemId, ProblemStatus>;
  showPenalties: boolean;
  selectedLanguages: Set<string>;
  userRatingInfo: RatingInfo;
}

const getProblemHeaderAlphabetFromTitle = (problem: Problem) => {
  const list = problem.title.split(".");
  return list.length === 0 ? "" : list[0];
};

const AtCoderRegularTableSFC: React.FC<Props> = (props) => {
  const { colorMode, selectedLanguages, showPenalties, userRatingInfo } = props;
  const problemModels = useProblemModelMap();
  interface OneContest {
    contest: Contest;
    id: string;
    problemStatus: Map<
      string,
      {
        problem: Problem;
        status: ProblemStatus;
        model?: ProblemModel;
        cellColor: TableColor;
      }
    >;
    solvedAll: boolean;
    rowColor: TableColor;
  }
  const contests: OneContest[] = props.contests
    .map((contest) => {
      const problems = (
        props.contestToProblems.get(contest.id) ?? []
      ).sort((a, b) => a.id.localeCompare(b.id));
      const problemStatusList = problems.map((problem) => {
        const status = props.statusLabelMap.get(problem.id) ?? noneStatus();
        return {
          problem,
          status,
          model: problemModels?.get(problem.id),
          cellColor: statusToTableColor({
            colorMode,
            status,
            contest,
            selectedLanguages,
          }),
        };
      });
      const problemStatus = new Map(
        problemStatusList.map((status) => {
          const alphabet = getProblemHeaderAlphabetFromTitle(status.problem);
          return [alphabet, status];
        })
      );
      const rowColor = combineTableColorList({
        colorMode,
        colorList: problemStatusList.map(({ cellColor }) => cellColor),
      });
      const solvedAll = problemStatusList.every(
        ({ status }) => status.label === StatusLabel.Success
      );
      return {
        contest,
        id: contest.id,
        problemStatus,
        solvedAll,
        rowColor,
      } as OneContest;
    })
    .filter(
      ({ solvedAll }: OneContest) => !props.hideCompletedContest || !solvedAll
    )
    .sort(
      (a, b) => b.contest.start_epoch_second - a.contest.start_epoch_second
    );

  const headerList = props.contests
    .flatMap((contest) => props.contestToProblems.get(contest.id) ?? [])
    .map((problem) => getProblemHeaderAlphabetFromTitle(problem))
    .filter((alphabet) => alphabet.length > 0);

  const header = Array.from(new Set(headerList)).sort();
  return (
    <Row className="my-4">
      <h2>{props.title}</h2>
      <BootstrapTable
        data={contests}
        tableContainerClass="contest-table-responsive contest-regular-table-responsive"
      >
        <TableHeaderColumn
          isKey
          dataField="id"
          columnClassName={(_: string, { rowColor }: OneContest): TableColor =>
            rowColor
          }
          dataFormat={(_, { contest }: OneContest): React.ReactElement => (
            <ContestLink contest={contest} title={contest.id.toUpperCase()} />
          )}
        >
          Contest
        </TableHeaderColumn>
        {header.map((c) => (
          <TableHeaderColumn
            dataField={c}
            key={c}
            className={() =>
              contests.every(({ problemStatus }) => {
                const current = problemStatus.get(c)?.status;
                return !current || current.label === StatusLabel.Success;
              })
                ? TableColor.Success
                : TableColor.None
            }
            columnClassName={(_, { problemStatus }: OneContest): string => {
              const problem = problemStatus.get(c);
              return [
                "table-problem",
                !problem ? "table-problem-empty" : problem.cellColor,
              ]
                .filter((nm) => nm)
                .join(" ");
            }}
            dataFormat={(
              _,
              { contest, problemStatus }: OneContest
            ): string | React.ReactElement => {
              const problem = problemStatus.get(c);
              const model = problem ? problem.model : undefined;
              if (problem) {
                return (
                  <>
                    <ProblemLink
                      isExperimentalDifficulty={
                        !!model && model.is_experimental
                      }
                      showDifficultyUnavailable
                      showDifficulty={props.showDifficulty}
                      contestId={contest.id}
                      problemId={problem.problem.id}
                      problemTitle={problem.problem.title}
                      problemModel={model}
                      userRatingInfo={userRatingInfo}
                    />
                    {props.colorMode === ColorMode.ContestResult && (
                      <SubmitTimespan
                        contest={contest}
                        problemStatus={problem.status}
                        showPenalties={showPenalties}
                      />
                    )}
                  </>
                );
              } else {
                return "";
              }
            }}
          >
            {c}
          </TableHeaderColumn>
        ))}
      </BootstrapTable>
    </Row>
  );
};

export const AtCoderRegularTable = React.memo(AtCoderRegularTableSFC);
