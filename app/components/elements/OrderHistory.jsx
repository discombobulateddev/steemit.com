import React from "react";
import HistoryRow from "./OrderhistoryRow.jsx";

export default class OrderHistory extends React.Component {

    constructor() {
        super();

        this.state = {
            historyIndex: 0,
            animate: false
        }
    }

    componentDidMount() {
        setTimeout(() => {
            this.setState({
            animate: true
            });
        }, 2000);
    }

    renderHistoryRows(history, buy) {
        if (!history.length) {
            return null;
        }

        let {historyIndex} = this.state;

        return history.map((order, index) => {
            if (index >= historyIndex && index < (historyIndex + 10)) {
                return (
                    <HistoryRow
                        key={order.date.getTime() + order.getStringPrice() + order.getStringSBD()}
                        index={index}
                        order={order}
                        animate={this.state.animate}
                    />
                );
            }
        }).filter(a => {
            return !!a;
        });
    }

    _setHistoryPage(back) {
        let newState = {};
        const newIndex = this.state.historyIndex + (back ? 10 : -10);
        newState.historyIndex = Math.min(Math.max(0, newIndex), this.props.history.length - 10);

        // Disable animations while paging
        if (newIndex !== this.state.historyIndex) {
            newState.animate = false;
        }
        // Reenable animatons after paging complete
        this.setState(newState, () => {
            this.setState({animate: true})
        });
    }

    render() {
        const {history} = this.props;
        const {historyIndex} = this.state;

        return (
            <section>
                <table className="Market__trade-history">
                    <thead>
                        <tr>
                            <th style={{textAlign: "center"}}>Date</th>
                            <th style={{textAlign: "right"}}>Price</th>
                            <th style={{textAlign: "right"}}>Steem</th>
                            <th style={{textAlign: "right"}}>SD ($)</th>
                        </tr>
                    </thead>
                    <tbody>
                            {this.renderHistoryRows(history)}
                    </tbody>
                </table>

                <nav>
                  <ul className="pager" style={{marginTop: 0, marginBottom: 0}}>
                    <li>
                        <div className={"button tiny hollow float-left " + (historyIndex === 0 ? " disabled" : "")}  onClick={this._setHistoryPage.bind(this, false)} aria-label="Previous">
                            <span aria-hidden="true">&larr; Newer</span>
                        </div>
                    </li>
                    <li>
                        <div className={"button tiny hollow float-right " + (historyIndex >= (history.length - 10) ? " disabled" : "")}  onClick={this._setHistoryPage.bind(this, true)} aria-label="Next">
                            <span aria-hidden="true">Older &rarr;</span>
                        </div>
                    </li>
                  </ul>
                </nav>
            </section>

        )
    }

}
