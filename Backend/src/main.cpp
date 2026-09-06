#include "crow.h"
#include <pqxx/pqxx>

int main(){
    crow::SimpleApp app;  //this will create our server obj.

    CROW_ROUTE(app,"/db-test")([](){ // command is used to connect the db to the crow 
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER"))); // create a connection with database with dbname = pawalert ,
            pqxx::work txn(conn);

            pqxx::result r = txn.exec("SELECT area_name FROM area WHERE area_id = 1");
            txn.commit();

            std::string area_name = r[0][0].c_str();

            crow::json::wvalue response;
            response["connected"] = true;
            response["area_name"] = area_name;
            return crow::response(200, response);
        }
        catch (const std::exception& e) {
            crow::json::wvalue error;
            error["connected"] = false;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });


    CROW_ROUTE(app, "/")([](){                   //whenver some send get request "\" this function will gonna work.
        return "PawAlert server is running";
    });
    CROW_ROUTE(app,"/health")([](){              //this will send a proper json response return ,just like real api do .
        crow::json::wvalue response;
        response["service"] = "pawalert-backend";
        response["status"] = "ok";
        return response;
    });

    CROW_ROUTE(app, "/reports").methods(crow::HTTPMethod::POST)([](                //this is explicitly say it's post otherwise it will treat as get.
        const crow::request& req){
            auto body = crow::json::load(req.body);
            if(!body){
                return crow::response(400,"Invalid Json");
            }
            std::string animal_type = body["animal_type"].s();
            std::string condition = body["condition"].s();
            crow::json::wvalue response;
            response["report_id"] = 101;
            response["animal_type"] = animal_type;
            response["condition"] = condition;
            response["status"] = "pending";
            return crow::response(201, response);
                });
            CROW_ROUTE(app,"/cases/<int>/verify").methods(crow::HTTPMethod::PATCH)([](int case_id){
                crow::json::wvalue response;
                response["case_id"] = case_id;
                response["status"] = "verified";
                response["message"] = "case has been verified by moderator";
                return crow::response(200, response);
            });
    CROW_ROUTE(app,"/areas/<int>").methods(crow::HTTPMethod::PATCH)([](const crow::request& req, int area_id){
        auto body = crow::json::load(req.body);
            if(!body) return crow::response(400, "INVALID JSON");
            std::string new_name = body["area_name"].s();

            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);

                txn.exec_params(
                    "UPDATE area SET area_name = $1 WHERE area_id = $2",
                    new_name, area_id
                );
                txn.commit();

                crow::json::wvalue response;
                response["area_id"] = area_id;
                response["area_name"] = new_name;
                return crow::response(200, response);
            }
            catch(const std::exception& e){
                crow::json::wvalue error;
                error["error"] = e.what();
                return crow::response(400, error);
            }
    });
    CROW_ROUTE(app,"/areas").methods(crow::HTTPMethod::POST)([](const crow::request& req){
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400, "INVALID JSON");
        std::string area_name = body["area_name"].s();
            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);
                pqxx::result r = txn.exec_params(
                    "INSERT INTO area (area_name) VALUES ($1) RETURNING area_id",
                    area_name
                );
                txn.commit();
                crow::json::wvalue response;
                response["area_id"] = r[0][0].as<int>();
                response["area_name"] = area_name;
                return crow::response(201, response);
            }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
            }
        });
    CROW_ROUTE(app,"/areas")([](){
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec("SELECT area_id, area_name FROM area");
            txn.commit();

            crow::json::wvalue response;
            int i = 0;
            for(auto row : r){
                response[i]["area_id"] = row["area_id"].as<int>();
                response[i]["area_name"] = row["area_name"].c_str();
                i++;
            }
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });
    app.port(8080).multithreaded().run();        //serve this server on port 8080 and we can handle multiple request which is imp for os.
}